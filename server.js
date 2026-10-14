const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Paystack requires the raw body or JSON body to verify signatures
app.use(express.json());
app.use(cors());

// Initialize Supabase Admin Client (Uses Service Role key to bypass RLS safely on backend)
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Paystack Webhook Endpoint
app.post('/webhook/paystack', async (req, res) => {
    try {
        const paystackSignature = req.headers['x-paystack-signature'];
        const secretKey = process.env.PAYSTACK_SECRET_KEY;

        // 1. Verify that the request actually came from Paystack for security
        const hash = crypto.createHmac('sha512', secretKey)
                            .update(JSON.stringify(req.body))
                            .digest('hex');

        if (hash !== paystackSignature) {
            console.warn("⚠️ Unauthorized webhook signature attempt blocked.");
            return res.status(401).send('Invalid signature');
        }

        const event = req.body;

        // 2. Check if payment was successful
        if (event.event === 'charge.success') {
            const customerEmail = event.data.customer.email.trim().toLowerCase();
            console.log(`💰 Payment confirmed via webhook for: ${customerEmail}`);

            // 3. Find the user ID in Supabase Auth by their email
            const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();

            if (listError) {
                console.error("Error listing Supabase users:", listError);
                return res.status(500).send('Database error');
            }

            let targetUser = authUsers?.users?.find(u => u.email.toLowerCase() === customerEmail);

            if (!targetUser) {
                console.log(`👤 User ${customerEmail} not found in Supabase Auth. Auto-creating account...`);
                
                const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: customerEmail,
                    email_confirm: true
                });
                
                if (createError) {
                    console.error("❌ Failed to auto-create user:", createError);
                    return res.status(500).send('User creation failed');
                }
                targetUser = createdUser.user;
            }

            // 4. Securely upgrade their profile to premium
            const { error: updateError } = await supabaseAdmin
                .from('profiles')
                .update({ is_subscribed: true })
                .eq('id', targetUser.id);

            if (updateError) {
                console.error("❌ Failed to update profile subscription:", updateError);
                return res.status(500).send('Profile update failed');
            }

            console.log(`🎉 Success! User ${targetUser.id} (${customerEmail}) auto-created/found and upgraded to Premium.`);
        }

        res.sendStatus(200);
    } catch (err) {
        console.error("Webhook processing error:", err);
        res.status(500).send('Server error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 GleanWord backend server running on port ${PORT}`);
});
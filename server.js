const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BANK_CODE_TO_NAME = {
  '058': 'Guaranty Trust Bank (GTB)',
  '057': 'Zenith Bank',
  '044': 'Access Bank',
  '033': 'United Bank for Africa (UBA)',
  '011': 'First Bank of Nigeria',
  '214': 'First City Monument Bank (FCMB)',
  '070': 'Fidelity Bank',
  '035': 'Wema Bank',
  '232': 'Sterling Bank',
  '50211': 'Kuda MFB',
  '50515': 'Moniepoint MFB',
  '999992': 'OPay',
  '999991': 'PalmPay'
};

async function createFlutterwaveTransfer(transferDetails) {
    const body = JSON.stringify(transferDetails);
    const responseData = await new Promise((resolve, reject) => {
        const request = https.request('https://api.flutterwave.com/v3/transfers', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            agent: process.env.FIXIE_URL ? new HttpsProxyAgent(process.env.FIXIE_URL) : undefined
        }, response => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { responseBody += chunk; });
            response.on('end', () => {
                try {
                    resolve({ statusCode: response.statusCode, data: JSON.parse(responseBody) });
                } catch (err) {
                    reject(new Error(`Invalid JSON response from Flutterwave: ${err.message}`));
                }
            });
        });

        request.on('error', reject);
        request.end(body);
    });

    const { statusCode, data } = responseData;
    if (statusCode < 200 || statusCode >= 300) {
        throw new Error(data.message || `Flutterwave transfer request failed with status ${statusCode}.`);
    }
    if (data.status !== 'success') {
        throw new Error(data.message || 'Flutterwave did not create the transfer.');
    }

    return data;
}

function createFlutterwaveReference(reference) {
    return `GW-${crypto.createHash('sha256').update(String(reference)).digest('hex').slice(0, 32)}`;
}

async function requestMatchesUser(req, userId) {
    const authorization = req.headers.authorization || '';
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken || !userId) return false;

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
    return !error && user?.id === userId;
}

app.post('/api/create-subaccount', async (req, res) => {
    try {
        const { userId, businessName, settlementBank, bankName, accountNumber } = req.body;
        const resolvedBankName =
            (bankName && bankName !== settlementBank ? bankName : null) ||
            BANK_CODE_TO_NAME[String(settlementBank)] ||
            settlementBank;
        if (!userId || !settlementBank || !accountNumber) {
            return res.status(400).json({ error: 'Missing required bank or user details.' });
        }
        if (!await requestMatchesUser(req, userId)) {
            return res.status(401).json({ error: 'Sign in as the payout account owner to continue.' });
        }

        const paystackResponse = await fetch('https://api.paystack.co/subaccount', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                business_name: businessName || 'GleanWord Author',
                settlement_bank: settlementBank,
                account_number: accountNumber,
                percentage_charge: 20
            }),
        });

        const paystackData = await paystackResponse.json();

        if (!paystackData.status) {
            return res.status(400).json({
                error: paystackData.message || 'Failed to create Paystack subaccount.'
            });
        }

        const subaccountCode = paystackData.data.subaccount_code;

        const { error: dbError } = await supabaseAdmin
            .from('profiles')
            .update({
                payout_region: 'nigeria',
                paystack_subaccount_code: subaccountCode,
                account_number: accountNumber,
                bank_name: resolvedBankName,
                payout_currency: null,
                intl_payout_details: null
            })
            .eq('id', userId);

        if (dbError) {
            console.error('Supabase profile update error:', dbError);
            return res.status(500).json({ error: 'Failed to save payout profile to database.' });
        }

        return res.status(200).json({
            success: true,
            message: 'Payout account successfully linked!',
            subaccount_code: subaccountCode
        });

    } catch (err) {
        console.error('Server error in /api/create-subaccount:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

app.post('/api/register-international-payout', async (req, res) => {
    try {
        const {
            userId,
            currency,
            account_bank,
            account_number,
            routing_number,
            swift_code,
            beneficiary_name,
            beneficiary_address,
            beneficiary_country
        } = req.body;
        const supportedCurrencies = ['USD', 'GBP', 'EUR'];
        const normalizedCurrency = String(currency || '').toUpperCase();
        const normalizedAccountBank = String(account_bank || '').trim();
        const normalizedAccountNumber = String(account_number || '').trim();
        const normalizedRoutingNumber = String(routing_number || '').trim();
        const normalizedSwiftCode = String(swift_code || '').trim().toUpperCase();
        const normalizedBeneficiaryName = String(beneficiary_name || '').trim();
        const normalizedBeneficiaryAddress = String(beneficiary_address || '').trim();
        const normalizedBeneficiaryCountry = String(beneficiary_country || '').trim().toUpperCase();

        if (!userId || !supportedCurrencies.includes(normalizedCurrency) ||
            !normalizedAccountBank || !normalizedAccountNumber || !normalizedBeneficiaryName ||
            !normalizedBeneficiaryAddress || !/^[A-Z]{2}$/.test(normalizedBeneficiaryCountry) ||
            (!normalizedRoutingNumber && !normalizedSwiftCode)) {
            return res.status(400).json({ error: 'Missing or invalid international payout details.' });
        }
        if (!await requestMatchesUser(req, userId)) {
            return res.status(401).json({ error: 'Sign in as the payout account owner to continue.' });
        }

        const intlPayoutDetails = {
            account_bank: normalizedAccountBank,
            account_number: normalizedAccountNumber,
            routing_number: normalizedRoutingNumber || null,
            swift_code: normalizedSwiftCode || null,
            beneficiary_name: normalizedBeneficiaryName,
            beneficiary_address: normalizedBeneficiaryAddress,
            beneficiary_country: normalizedBeneficiaryCountry,
            currency: normalizedCurrency
        };

        const { error: dbError } = await supabaseAdmin
            .from('profiles')
            .update({
                payout_region: 'international',
                payout_currency: normalizedCurrency,
                bank_name: normalizedAccountBank,
                account_number: normalizedAccountNumber,
                intl_payout_details: intlPayoutDetails,
                paystack_subaccount_code: null
            })
            .eq('id', userId);

        if (dbError) {
            console.error('Supabase international payout profile update error:', dbError);
            return res.status(500).json({ error: 'Failed to save payout profile to database.' });
        }

        return res.status(200).json({
            success: true,
            message: 'International payout account successfully linked!'
        });
    } catch (err) {
        console.error('Server error in /api/register-international-payout:', err);
        return res.status(500).json({ error: 'Failed to register international payout account.' });
    }
});

app.post('/webhook/paystack', async (req, res) => {
    try {
        const paystackSignature = req.headers['x-paystack-signature'];
        const secretKey = process.env.PAYSTACK_SECRET_KEY;

        const hash = crypto.createHmac('sha512', secretKey)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== paystackSignature) {
            console.warn("⚠️ Unauthorized webhook signature attempt blocked.");
            return res.status(401).send('Invalid signature');
        }

        const event = req.body;

        if (event.event === 'charge.success') {
            const customerEmail = event.data.customer.email.trim().toLowerCase();
            console.log(`💰 Payment confirmed via webhook for: ${customerEmail}`);

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

            const metadata = event.data.metadata || {};
            if (metadata.corpus_id) {
                const corpusId = metadata.corpus_id;
                const amountPaid = event.data.amount / 100;
                const reference = event.data.reference;

                const { error: purchaseError } = await supabaseAdmin
                    .from('user_purchases')
                    .upsert([{
                        user_id: targetUser.id,
                        corpus_id: corpusId,
                        paystack_reference: reference,
                        amount: amountPaid,
                        user_email: customerEmail
                    }], { onConflict: 'paystack_reference' });

                if (purchaseError) {
                    console.error("❌ Failed to log book purchase:", purchaseError);
                    return res.status(500).send('Book purchase logging failed');
                }

                console.log(`📚 Success! Book ${corpusId} unlocked for user ${targetUser.id}`);

                const { data: work, error: workError } = await supabaseAdmin
                    .from('works')
                    .select('author_id')
                    .eq('id', corpusId)
                    .maybeSingle();

                if (workError || !work) {
                    console.error('Failed to find the purchased book author:', workError || 'Book not found.');
                    return res.status(500).send('Book author lookup failed');
                }

                const { data: authorProfile, error: profileError } = await supabaseAdmin
                    .from('profiles')
                    .select('payout_region, payout_currency, intl_payout_details')
                    .eq('id', work.author_id)
                    .maybeSingle();

                if (profileError) {
                    console.error('Failed to load author payout profile:', profileError);
                    return res.status(500).send('Author payout profile lookup failed');
                }

                if (authorProfile?.payout_region === 'international') {
                    const beneficiary = authorProfile.intl_payout_details;
                    if (!beneficiary || !authorProfile.payout_currency) {
                        console.error(`International payout profile is incomplete for author ${work.author_id}.`);
                        return res.status(500).send('International author payout profile is incomplete');
                    }

                    if (!process.env.FLW_SECRET_KEY) {
                        console.error('Flutterwave payout configuration is missing.');
                        return res.status(500).send('Flutterwave payouts are not configured');
                    }

                    const royaltyAmount = Number((amountPaid * 0.8).toFixed(2));
                    if (royaltyAmount <= 0) {
                        console.error(`Invalid Flutterwave royalty amount for Paystack reference ${reference}.`);
                        return res.status(500).send('Invalid author royalty amount');
                    }

                    const transferResponse = await createFlutterwaveTransfer({
                        account_bank: beneficiary.account_bank,
                        account_number: beneficiary.account_number,
                        amount: royaltyAmount,
                        currency: authorProfile.payout_currency,
                        debit_currency: 'NGN',
                        narration: `GleanWord author royalty for ${corpusId}`,
                        reference: createFlutterwaveReference(reference),
                        beneficiary_name: beneficiary.beneficiary_name,
                        beneficiary_address: beneficiary.beneficiary_address,
                        beneficiary_country: beneficiary.beneficiary_country,
                        ...(beneficiary.routing_number ? { routing_number: beneficiary.routing_number } : {}),
                        ...(beneficiary.swift_code ? { swift_code: beneficiary.swift_code } : {}),
                        meta: [
                            { metaname: 'beneficiary_name', metavalue: beneficiary.beneficiary_name },
                            { metaname: 'beneficiary_address', metavalue: beneficiary.beneficiary_address },
                            { metaname: 'beneficiary_country', metavalue: beneficiary.beneficiary_country },
                            ...(beneficiary.routing_number
                                ? [{ metaname: 'routing_number', metavalue: beneficiary.routing_number }]
                                : []),
                            ...(beneficiary.swift_code
                                ? [{ metaname: 'swift_code', metavalue: beneficiary.swift_code }]
                                : [])
                        ]
                    });
                    console.log(
                        `Flutterwave royalty transfer ${transferResponse.data?.id || 'created'} for author ${work.author_id}, reference ${reference}.`
                    );
                }
            }

            else if (metadata.is_subscription || event.data.plan) {
                const { error: updateError } = await supabaseAdmin
                    .from('profiles')
                    .update({ is_subscribed: true })
                    .eq('id', targetUser.id);

                if (updateError) {
                    console.error("❌ Failed to update profile subscription:", updateError);
                    return res.status(500).send('Profile update failed');
                }

                console.log(`⭐ Success! User ${targetUser.id} (${customerEmail}) upgraded to Premium subscription.`);
            }

            res.sendStatus(200);
        }
    } catch (err) {
        console.error("Webhook processing error:", err);
        res.status(500).send('Server error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 GleanWord backend server running on port ${PORT}`);
});
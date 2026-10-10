import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    // 1. Verify it's a POST request from Paystack
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const payload = await req.json()

    // 2. Listen for successful charge events
    if (payload.event === 'charge.success') {
      const userEmail = payload.data.customer.email.toLowerCase().trim()

      // Initialize Supabase admin client using Service Role Key (bypasses RLS)
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // 3. Find the user ID in auth.users by email
      const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers()
      if (userError) throw userError

      const targetUser = users.users.find(u => u.email?.toLowerCase() === userEmail)

      if (targetUser) {
        // 4. Set is_subscribed = true in profiles table
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ is_subscribed: true })
          .eq('id', targetUser.id)

        if (updateError) throw updateError

        console.log(`Successfully activated subscription for: ${userEmail}`)
      } else {
        console.log(`User email ${userEmail} not found in auth.users yet.`)
      }
    }

    return new Response(JSON.stringify({ status: 'success' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
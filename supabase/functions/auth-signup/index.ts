// Supabase Edge Function: auth-signup
//
// Purpose: make username-only signup work on projects where the dashboard
// enables "Confirm email" (and/or strict email-domain validation). The
// client cannot confirm a synthetic mailbox, and GoTrue rejects
// `<user>@users.axonlogs.app` with `email_address_invalid` under the new
// validation. The ADMIN API bypasses both: it creates a confirmed user
// without sending any email.
//
// Security: runs server-side; the service-role key is injected by the edge
// runtime as SUPABASE_SERVICE_ROLE_KEY and is NEVER shipped to the browser.
// The function only creates one auth user + one profile row per call and
// enforces the same username rules as the client.
//
// Deploy (owner, one command after `supabase login`):
//   supabase functions deploy auth-signup --project-ref qlepfndedkpqmzyfnhmc
//
// Client contract (src/utils/auth.ts):
//   POST { username, password, avatar_gradient }
//   200 { ok: true }            → client then signs in with password
//   409 { error: 'username_taken' }
//   400 { error: 'invalid_username' | 'weak_password' }
//   5xx { error: 'signup_unavailable' }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const syntheticEmail = (username: string) => `${username}@users.axonlogs.app`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const { username, password, avatar_gradient } = await req.json();
    const u = String(username || '').trim().toLowerCase().replace(/^@/, '');

    if (!USERNAME_RE.test(u) || /^\.|\.$/.test(u)) {
      return json(400, { error: 'invalid_username' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return json(400, { error: 'weak_password' });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1 — create the auth user, CONFIRMED, without sending any email
    //     (admin API skips SMTP, rate limits and domain validation).
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail(u),
      password,
      email_confirm: true,
      user_metadata: { username: u },
    });

    if (createErr) {
      const msg = String((createErr as any).message || '');
      if ((createErr as any).code === 'auth_user_already_exists' || /already/i.test(msg)) {
        return json(409, { error: 'username_taken' });
      }
      if (/password/i.test(msg) && /character|short|weak/i.test(msg)) {
        return json(400, { error: 'weak_password' });
      }
      console.error('createUser failed:', createErr);
      return json(500, { error: 'signup_unavailable' });
    }

    // 2 — create/claim the public profile row (service role bypasses RLS)
    const authUid = created?.user?.id;
    if (authUid) {
      const { data: existing } = await supabaseAdmin
        .from('accounts')
        .select('username')
        .eq('username', u)
        .maybeSingle();
      if (!existing) {
        await supabaseAdmin.from('accounts').insert({
          username: u,
          auth_uid: authUid,
          bio: '',
          avatar_gradient: avatar_gradient || '',
          display_name: '',
        });
      } else {
        await supabaseAdmin.from('accounts').update({ auth_uid: authUid }).eq('username', u);
      }
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error('auth-signup error:', err);
    return json(500, { error: 'signup_unavailable' });
  }
});

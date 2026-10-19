// Supabase Edge Function: admin-ops
//
// Purpose: server-side moderation operations for the owner-only admin
// panel (master-prompt Phase 7). The authoritative ban lives in Supabase
// Auth (auth.admin), which requires the service role — only an edge
// function holds that. Every call re-verifies the CALLER's admin role
// from the `admin_users` table (server-enforced; no header trust) and
// appends an immutable audit row.
//
// ADMINS CANNOT READ PRIVATE CHATS. This function exposes NO message or
// chat content endpoints — only account lifecycle operations. Under E2EE
// (SECTION 9) ciphertext is undecryptable without device keys; moderation
// runs exclusively through the reports queue with reporter-attached
// evidence.
//
// Client contract (src/utils/admin.ts):
//   POST { action: 'ban',    username, reason }   → { ok: true }
//   POST { action: 'unban',  username }           → { ok: true }
//   POST { action: 'delete', username, reason }   → { ok: true }
//   401 { error: 'unauthorized' } | 403 { error: 'admin_only' }
//   400 { error: 'bad_request' }  | 404 { error: 'user_not_found' }
//   5xx { error: 'operation_failed' }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'unauthorized' });

    // Client-scoped client (verifies the CALLER's JWT is real)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const caller = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await caller.auth.getUser();
    if (authErr || !authData?.user) return json(401, { error: 'unauthorized' });

    // Service-role client (admin API + RLS bypass, server-only)
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRole) return json(500, { error: 'operation_failed' });
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve the caller's app username from auth_uid
    const uid = authData.user.id;
    const { data: acctRow } = await admin
      .from('accounts')
      .select('username')
      .eq('auth_uid', uid)
      .maybeSingle();
    const actor = acctRow?.username;
    if (!actor) return json(403, { error: 'admin_only' });

    // SERVER-ENFORCED admin check — the only source of truth
    const { data: adminRow } = await admin
      .from('admin_users')
      .select('username')
      .eq('username', actor)
      .maybeSingle();
    if (!adminRow) return json(403, { error: 'admin_only' });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const target = String(body.username || '').trim().toLowerCase().replace(/^@/, '');
    const reason = String(body.reason || '').slice(0, 500);

    // Resolve the target account
    const { data: targetAcct } = await admin
      .from('accounts')
      .select('username, auth_uid, banned, ban_reason')
      .eq('username', target)
      .maybeSingle();
    if (!targetAcct) return json(404, { error: 'user_not_found' });

    const audit = (a: string, details: Record<string, unknown>) =>
      admin.from('admin_audit_log').insert({
        actor_username: actor,
        action: a,
        target_type: 'account',
        target_id: target,
        details,
      });

    if (action === 'ban') {
      if (!reason) return json(400, { error: 'bad_request', detail: 'reason required' });
      if (targetAcct.auth_uid) {
        // Permanent auth-level ban: revokes the user's sessions/tokens.
        const { error: banErr } = await admin.auth.admin.updateUserById(targetAcct.auth_uid, {
          ban_duration: '876000h', // ~100 years = permanent
        });
        if (banErr) return json(500, { error: 'operation_failed', detail: banErr.message });
      }
      await admin
        .from('accounts')
        .update({ banned: true, ban_reason: reason })
        .eq('username', target);
      await audit('ban', { reason, auth_level_ban: !!targetAcct.auth_uid });
      return json(200, { ok: true });
    }

    if (action === 'unban') {
      if (targetAcct.auth_uid) {
        const { error: unbanErr } = await admin.auth.admin.updateUserById(targetAcct.auth_uid, {
          ban_duration: 'none',
        });
        if (unbanErr) return json(500, { error: 'operation_failed', detail: unbanErr.message });
      }
      await admin
        .from('accounts')
        .update({ banned: false, ban_reason: '' })
        .eq('username', target);
      await audit('unban', {});
      return json(200, { ok: true });
    }

    if (action === 'delete') {
      if (!reason) return json(400, { error: 'bad_request', detail: 'reason required' });
      // Retention policy (documented): immediate hard delete of the auth
      // user + app rows owned by the account.
      const { error: chatErr } = await admin
        .from('chats')
        .delete()
        .eq('created_by', targetAcct.auth_uid || '00000000-0000-0000-0000-000000000000');
      if (chatErr) console.error('chat cleanup:', chatErr.message);
      await admin.from('chat_participants').delete().eq('username', target);
      await admin.from('dm_invites').delete().eq('to_username', target);
      await admin.from('dm_invites').delete().eq('from_username', target);
      await admin.from('follows').delete().eq('follower', target);
      await admin.from('follows').delete().eq('followed', target);
      await admin.from('account_keys').delete().eq('username', target);
      await admin.from('chat_lock_settings').delete().eq('user_id', targetAcct.auth_uid || '');
      if (targetAcct.auth_uid) {
        const { error: delErr } = await admin.auth.admin.deleteUser(targetAcct.auth_uid);
        if (delErr) return json(500, { error: 'operation_failed', detail: delErr.message });
      }
      await admin.from('accounts').delete().eq('username', target);
      await audit('delete', { reason, retention: 'immediate-hard-delete' });
      return json(200, { ok: true });
    }

    return json(400, { error: 'bad_request', detail: 'unknown action' });
  } catch (err) {
    console.error('admin-ops error:', err);
    return json(500, { error: 'operation_failed' });
  }
});

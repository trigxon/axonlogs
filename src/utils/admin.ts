/**
 * admin.ts — Phase 7 client surface for the owner-only admin panel.
 *
 * Everything here is backed by SERVER enforcement:
 *  - the role lives in `admin_users` and is readable by admins only
 *    (a non-admin's SELECT returns an empty list — the UI gate is
 *    backed by RLS, not by hidden buttons);
 *  - stat aggregation runs inside the admin_stats() SECURITY DEFINER
 *    RPC which re-checks the role server-side;
 *  - lifecycle operations (ban / unban / delete) go through the
 *    `admin-ops` edge function which re-verifies the role from the
 *    table and appends to the immutable audit log;
 *  - report resolution is RLS-restricted to admins;
 *  - NO endpoint anywhere returns chat message content: admins cannot
 *    read private conversations (E2EE — SECTION 9), moderation is
 *    evidence-based via the reports queue only.
 */

import { supabase } from '../contexts/CryptoContext';

export type AdminStats = {
  accounts_total: number;
  accounts_verified: number;
  accounts_legacy: number;
  messages_total: number;
  chats_total: number;
  calls_total: number;
  reports_open: number;
  reports_total: number;
  attachments_bytes: number;
  banned_total: number;
  newest_accounts: { username: string; created_at: string; verified: boolean | null }[];
  // Honest gaps — not recorded server-side (yet)
  otp_outcomes: string | null;
  rate_limit_events: string | null;
};

export type AdminAuditRow = {
  id: number;
  actor_username: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type ReportRow = {
  id: string;
  reporter_username: string;
  chat_id: string;
  message_id: string;
  reported_username: string;
  reason: string;
  evidence: string;
  status: 'open' | 'reviewed' | 'actioned' | 'dismissed';
  admin_note: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type AccountRow = {
  username: string;
  created_at: string;
  banned: boolean;
  ban_reason: string;
  auth_uid: string | null;
  verified?: boolean | null;
};

/** True when the caller holds the server-enforced admin role. */
export const checkAdminRole = async (): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.from('admin_users').select('username').limit(1);
    if (error) return false;      // RLS denial → definitely not an admin
    return (data || []).length > 0;
  } catch {
    return false;
  }
};

export const fetchAdminStats = async (): Promise<{ ok: boolean; stats?: AdminStats; error?: string }> => {
  if (!supabase) return { ok: false, error: 'no backend' };
  const { data, error } = await supabase.rpc('admin_stats');
  if (error) return { ok: false, error: error.message };
  return { ok: true, stats: data as AdminStats };
};

export const searchAccountsAdmin = async (query: string): Promise<AccountRow[]> => {
  if (!supabase) return [];
  const q = query.trim().toLowerCase().replace(/^@/, '');
  const base = supabase
    .from('accounts')
    .select('username, created_at, banned, ban_reason, auth_uid')
    .order('created_at', { ascending: false })
    .limit(25);
  const { data } = q
    ? await base.ilike('username', `%${q}%`)
    : await base;
  return (data || []) as AccountRow[];
};

export const adminOperate = async (
  action: 'ban' | 'unban' | 'delete',
  username: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) return { ok: false, error: 'no backend' };
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return { ok: false, error: 'Sign-in session missing.' };
    const url = `${(supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, username, reason }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = (body as any).detail ? ` (${(body as any).detail})` : '';
      return { ok: false, error: `${(body as any).error || resp.statusText}${detail}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Request failed.' };
  }
};

export const fetchAuditLog = async (limit = 100): Promise<AdminAuditRow[]> => {
  if (!supabase) return [];
  const { data } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as AdminAuditRow[];
};

export const fetchReports = async (): Promise<ReportRow[]> => {
  if (!supabase) return [];
  const { data } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  return (data || []) as ReportRow[];
};

export const resolveReport = async (
  id: string,
  status: 'reviewed' | 'actioned' | 'dismissed',
  adminNote: string,
  actorUsername: string
): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) return { ok: false, error: 'no backend' };
  const { error } = await supabase
    .from('reports')
    .update({
      status,
      admin_note: adminNote.slice(0, 500),
      resolved_by: actorUsername.toLowerCase(),
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  // audit the resolution
  await supabase.rpc('admin_write_audit', {
    p_action: `report_${status}`,
    p_target_type: 'report',
    p_target_id: id,
    p_details: { note: adminNote.slice(0, 500) },
  });
  return { ok: true };
};

/** File a report (any signed-in user — this is the user-facing intake). */
export const fileReport = async (input: {
  reporterUsername: string;
  chatId?: string;
  messageId?: string;
  reportedUsername?: string;
  reason: string;
  evidence?: string;
}): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) return { ok: false, error: 'no backend' };
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: 'Describe the problem (at least 3 characters).' };
  const { error } = await supabase.from('reports').insert({
    reporter_username: input.reporterUsername.toLowerCase(),
    chat_id: input.chatId || '',
    message_id: input.messageId || '',
    reported_username: (input.reportedUsername || '').toLowerCase(),
    reason: reason.slice(0, 2000),
    evidence: (input.evidence || '').slice(0, 4000),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

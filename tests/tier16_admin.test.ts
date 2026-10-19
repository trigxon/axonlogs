import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

/**
 * Tier 16: Phase 7 — owner-only admin panel.
 *
 * Structure-tested: schema SECTION 10 (server-enforced role via admin_users
 * + is_admin() SECURITY DEFINER, append-only audit log with NO update/delete
 * policies, reports intake with reporter-attached evidence, admin_stats with
 * honest NULL gaps, banned flags), the admin-ops edge function (caller role
 * re-verified server-side; NO message-content endpoints), the AdminPanel UI
 * (role gate backed by RLS, evidence-only moderation), the banned login gate
 * and the /admin route.
 */
export async function runTier16Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...p: string[]): string => fs.readFileSync(path.join(projectRoot, ...p), 'utf-8');
  const schema = read('supabase/schema.sql');
  const edge = read('supabase/functions/admin-ops/index.ts');
  const panel = read('src/components/admin/AdminPanel.tsx');
  const adminUtil = read('src/utils/admin.ts');
  const authUtil = read('src/utils/auth.ts');

  const push = (name: string, passed: boolean, error?: string) =>
    results.push({ name, tier: 16, passed, error, durationMs: 0 });

  const check = (name: string, assertions: (boolean | string)[]) => {
    try {
      const failures: string[] = [];
      assertions.forEach((c, i) => {
        const ok = typeof c === 'string' ? c.length > 0 : c;
        if (!ok) failures.push(`assertion#${i + 1}`);
      });
      if (failures.length > 0) push(name, false, `Failed: ${failures.join('; ')}`);
      else push(name, true);
    } catch (err: any) {
      push(name, false, String(err?.message || err));
    }
  };

  /* -------- 16.1 server-enforced role -------- */

  check('16.1 admin role is a server-enforced table, not a client string', [
    /create table if not exists public\.admin_users/.test(schema),
    // the runtime check is a SECURITY DEFINER function over the table
    /create or replace function public\.is_admin\(\)[\s\S]{0,300}select exists \(\s*select 1 from public\.admin_users/.test(schema),
    // only admins can even READ the role table (UI gate backed by RLS)
    /create policy "admins read admin_users"[\s\S]{0,120}using \(public\.is_admin\(\)\)/.test(schema),
    // NO self-service grant paths: no insert/update/delete policy on admin_users
    !/policy "admins? (insert|update|delete)[^"]*"[\s\S]{0,200}on public\.admin_users/.test(schema),
    !/create policy "[^"]*"[\s\S]{0,200}on public\.admin_users for insert/.test(schema),
    !/create policy "[^"]*"[\s\S]{0,200}on public\.admin_users for update/.test(schema),
  ]);

  check('16.2 role is not derived from usernames, URLs, or localStorage', [
    !/admin.*===.*['"](?:owner|admin|trigxon)['"]/i.test(read('src/components/layout/ChatApp.tsx')),
    !/localStorage\.(get|set)Item\(['"][^'"]*admin/i.test(adminUtil),
    !/localStorage\.(get|set)Item\(['"][^'"]*admin/i.test(panel),
    // the panel queries the server for the role
    /from\('admin_users'\)\.select/.test(adminUtil),
    /error\) return false/.test(adminUtil),
  ]);

  /* -------- 16.3 append-only audit log -------- */

  check('16.3 audit log is append-only and admin-readable only', [
    /create table if not exists public\.admin_audit_log/.test(schema),
    /create policy "admins read audit log"[\s\S]{0,120}using \(public\.is_admin\(\)\)/.test(schema),
    // NO update/delete policies on the audit table — immutable for everyone
    !/create policy "[^"]*"[\s\S]{0,240}on public\.admin_audit_log for update/.test(schema),
    !/create policy "[^"]*"[\s\S]{0,240}on public\.admin_audit_log for delete/.test(schema),
    // writes go through a definer RPC gated on is_admin()
    /create or replace function public\.admin_write_audit\([\s\S]*?if not public\.is_admin\(\) then\s*raise exception 'admin only';/.test(schema),
    // revokes block anon/public from the writer RPC
    /revoke execute on function public\.admin_write_audit\(text, text, text, jsonb\) from public, anon/.test(schema),
  ]);

  /* -------- 16.4 evidence-based moderation (no chat backdoor) -------- */

  check('16.4 no admin backdoor into private chats', [
    // the edge function exposes NO message/chat content endpoints
    !/from\('messages'\)/.test(edge),
    !/\.select\(\)[\s\S]{0,80}eq\('chat_id'/.test(edge),
    // the schema grants admins NOTHING extra on messages/chats
    !/is_admin\(\)[\s\S]{0,200}on public\.messages/.test(schema),
    // reports carry reporter-attached evidence, not server-decrypted content
    /create table if not exists public\.reports \([\s\S]*?evidence\s+text not null default ''/.test(schema),
    /reporter_username = public\.my_username\(\)\s*\n\s*and length\(reason\) between 3 and 2000/.test(schema),
    // only admins can resolve reports
    /create policy "admins resolve reports"[\s\S]{0,140}using \(public\.is_admin\(\)\)/.test(schema),
    // the panel says it out loud
    /cannot be read by anyone/.test(panel),
  ]);

  /* -------- 16.5 real-data dashboard with honest gaps -------- */

  check('16.5 dashboard shows real data and labels missing integrations', [
    /create or replace function public\.admin_stats\(\)[\s\S]*?if not public\.is_admin\(\) then/.test(schema),
    /'otp_outcomes',\s*null::text/.test(schema),
    /'rate_limit_events',\s*null::text/.test(schema),
    /Not recorded/.test(panel),
    /Verification attempts are not stored server-side yet\./.test(panel),
    /admin_stats'\)/.test(adminUtil),
  ]);

  /* -------- 16.6 account management -------- */

  check('16.6 ban / unban / delete with server verification + audit', [
    /action === 'ban'/.test(edge),
    /ban_duration: '876000h'/.test(edge),
    /action === 'unban'/.test(edge),
    /ban_duration: 'none'/.test(edge),
    /auth\.admin\.deleteUser\(targetAcct\.auth_uid\)/.test(edge),
    /retention: 'immediate-hard-delete'/.test(edge),
    // every op re-verifies the CALLER's role from the table
    /from\('admin_users'\)\s*\n\s*\.select\('username'\)\s*\n\s*\.eq\('username', actor\)/.test(edge),
    /if \(!adminRow\) return json\(403, \{ error: 'admin_only' \}\)/.test(edge),
    // every op writes the audit row
    /await audit\('ban'/.test(edge),
    /await audit\('unban'/.test(edge),
    /await audit\('delete'/.test(edge),
  ]);

  check('16.7 banned accounts are refused at login', [
    /This account is suspended/.test(authUtil),
    /banned,\s*ban_reason/.test(authUtil),
    /await supabase\.auth\.signOut\(\)/.test(authUtil.split('This account is suspended')[0].slice(-600) + authUtil.split('This account is suspended')[1].slice(0, 200)),
  ]);

  /* -------- 16.8 route + gate UI -------- */

  check('16.8 /admin route renders the server-gated panel', [
    /if \(p\.startsWith\('\/admin'\)\) return 'admin';/.test(read('src/components/layout/ChatApp.tsx')),
    /<AdminPanel onBack=\{\(\) => go\('\/direct'\)\} \/>/.test(read('src/components/layout/ChatApp.tsx')),
    /No access/.test(panel),
    /enforced by the database/.test(panel),
    /checkAdminRole/.test(panel),
  ]);

  return results;
}

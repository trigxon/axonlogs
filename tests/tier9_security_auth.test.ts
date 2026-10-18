import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

/**
 * Tier 9: Security baseline — Supabase Auth + real authorization (Phase B)
 * - auth.ts must run Supabase Auth (synthetic email identity) with a
 *   legacy PBKDF2 migration path — not a custom hash column alone
 * - supabase/schema.sql v2 must scope EVERY table to its owner via
 *   auth.uid()/my_username() — no world-writable policies on private data
 * - password hashes must not be publicly readable (SELECT revoked,
 *   legacy_login view only exposes UN-migrated rows)
 * - chat membership gates chats/messages; 1:1 DM sends are server-enforced
 *   to follow the "only chat who you follow" rule
 * - runtime: identity helpers (synthetic email, error classification)
 */
export async function runTier9Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...parts: string[]) =>
    fs.readFileSync(path.join(projectRoot, ...parts), 'utf-8');

  // 9.1: Supabase Auth is the identity layer (with legacy migration)
  const authStart = Date.now();
  try {
    const authUtil = read('src', 'utils', 'auth.ts');
    const ctx = read('src', 'contexts', 'CryptoContext.tsx');

    const checks: Array<[boolean, string]> = [
      [authUtil.includes('supabase.auth.signUp'), 'auth.ts must sign up through Supabase Auth'],
      [authUtil.includes('supabase.auth.signInWithPassword'), 'auth.ts must sign in through Supabase Auth'],
      [authUtil.includes('syntheticEmail') && authUtil.includes('@users.axonlogs.app'), 'auth.ts must map usernames to deterministic synthetic emails'],
      [authUtil.includes('export const validateUsername') && authUtil.includes('USERNAME_MAX = 30'), 'Instagram username rules must survive the migration'],
      [authUtil.includes('fetchLegacyHash') && authUtil.includes('legacy_login'), 'legacy accounts must verify through the legacy_login view'],
      [authUtil.includes('verifyPassword') && authUtil.includes('linkProfileToAuthUser'), 'legacy login must verify PBKDF2 then link auth_uid (invisible migration)'],
      [authUtil.includes('isAlreadyRegisteredError') && authUtil.includes('confirmationRequired'), 'auth.ts must classify Supabase Auth error shapes'],
      [authUtil.includes('logoutAccount') && authUtil.includes('auth?.signOut'), 'logout must end the Supabase Auth session'],
      [ctx.includes('logoutAccount(supabase)') && ctx.includes('insertChatParticipants'), 'CryptoContext must wire sign-out + chat membership rows'],
      [ctx.includes('joinChatByCode'), 'join-by-code must go through the v2 RPC (proof-of-code membership)'],
      [authUtil.includes('insertChatParticipants') && authUtil.includes('chat_participants'), 'auth.ts must manage chat_participants membership'],
    ];
    for (const [ok, name] of checks) {
      results.push({ name: `9.1 ${name}`, passed: ok, duration: 0 });
    }
    void authStart;
  } catch (err: any) {
    results.push({ name: '9.1 auth layer inspection', passed: false, duration: Date.now() - authStart, error: err?.message });
  }

  // 9.2: schema.sql v2 — no world-writable private data, ownership everywhere
  const schemaStart = Date.now();
  try {
    const schema = read('supabase', 'schema.sql');
    const v2 = schema.slice(schema.indexOf('SECTION 5'));

    const checks: Array<[boolean, string]> = [
      [v2.includes('auth_uid'), 'schema v2 must link accounts to Supabase Auth users'],
      [v2.includes('security definer') && v2.includes('my_username'), 'identity helper must be a security-definer function'],
      [v2.includes('revoke select on public.accounts'), 'accounts SELECT must be revoked (password hashes not world-readable)'],
      [v2.includes('create view public.profiles'), 'public profile reads must go through a safe view'],
      [v2.includes('create view public.legacy_login') && v2.includes('auth_uid is null'), 'legacy_login must expose only UN-migrated rows'],
      [v2.includes('create table if not exists public.chat_participants'), 'chat membership table must exist'],
      [v2.includes('join_chat_by_code'), 'join-by-code RPC must exist'],
      [v2.includes('my_blocklist') && v2.includes('is_blocked_either_way'), 'blocklist must be readable only via security-definer RPCs'],
      [v2.includes('for insert to authenticated\n  with check (follower = public.my_username())'), 'follows INSERT must be scoped to the follower'],
      [v2.includes('with check (from_username = public.my_username())'), 'dm_invites INSERT must be scoped to the sender'],
      [v2.includes('to_username = public.my_username() or from_username = public.my_username()'), 'dm_invites must be readable only by both parties'],
      [v2.includes('sender_id = public.my_username()'), 'messages INSERT must stamp the authenticated sender'],
      [v2.includes('f.follower = public.my_username()') && v2.includes("f.status = 'active'"), '1:1 DM sends must be server-gated on an ACTIVE follow'],
      [v2.includes('p.chat_id = messages.chat_id and p.username = public.my_username()'), 'messages must be readable only by chat members'],
      [v2.includes('p.chat_id = chats.id and p.username = public.my_username()'), 'chats must be readable only by chat members'],
    ];
    for (const [ok, name] of checks) {
      results.push({ name: `9.2 ${name}`, passed: ok, duration: 0 });
    }

    // The v2 section must not contain blanket world-writable policies
    const worldWritable = /for (insert|update|delete)[^\n]*\n\s*(using|with check) \((true)\)/.test(v2);
    results.push({ name: '9.2 v2 policies must not be world-writable (no using(true) on writes)', passed: !worldWritable, duration: 0 });
    void schemaStart;
  } catch (err: any) {
    results.push({ name: '9.2 schema v2 inspection', passed: false, duration: Date.now() - schemaStart, error: err?.message });
  }

  // 9.3: runtime — identity helpers behave correctly
  const runtimeStart = Date.now();
  try {
    const mod = await import('../src/utils/auth.ts');
    const checks: Array<[boolean, string]> = [
      [mod.syntheticEmail('alice') === 'alice@users.axonlogs.app', 'syntheticEmail maps username'],
      [mod.syntheticEmail('@Alice') === 'alice@users.axonlogs.app', 'syntheticEmail strips @ and lowercases'],
      [mod.syntheticEmail('  bob.lee  ') === 'bob.lee@users.axonlogs.app', 'syntheticEmail trims whitespace'],
      [mod.isAlreadyRegisteredError({ code: 'auth_user_already_exists' }) === true, 'already-registered detected via code'],
      [mod.isAlreadyRegisteredError({ message: 'User already registered' }) === true, 'already-registered detected via message'],
      [mod.isAlreadyRegisteredError({ message: 'Invalid login credentials' }) === false, 'invalid credentials is NOT already-registered'],
      [mod.confirmationRequired({ user: { id: 'u1' }, session: null }) === true, 'confirmation required when user returned without session'],
      [mod.confirmationRequired({ user: null, session: null }) === false, 'no user = not a confirmation case'],
      [mod.confirmationRequired({ user: { id: 'u1' }, session: { a: 1 } }) === false, 'session present = not a confirmation case'],
      [mod.validateUsername('alice') === null, 'username validation unchanged'],
      [mod.validatePassword('') === null && mod.validatePassword('x') === null, 'client password pre-validation stays unrestricted'],
    ];
    for (const [ok, name] of checks) {
      results.push({ name: `9.3 ${name}`, passed: ok, duration: 0 });
    }
  } catch (err: any) {
    results.push({ name: '9.3 runtime helpers', passed: false, duration: Date.now() - runtimeStart, error: err?.message });
  }
  void runtimeStart;

  // 9.4: profile reads route through the safe view with graceful fallback
  const viewsStart = Date.now();
  try {
    const authUtil = read('src', 'utils', 'auth.ts');
    const profile = read('src', 'components', 'profile', 'ProfilePanel.tsx');

    const checks: Array<[boolean, string]> = [
      [authUtil.includes(".from('profiles')") && authUtil.includes('isViewMissingError'), 'auth.ts profile reads must try profiles first with a view-missing fallback'],
      [authUtil.includes('fetchDisplayName'), 'display-name reads must work on both schema generations'],
      [profile.includes('fetchDisplayName'), 'ProfilePanel must read the display name through the helper'],
      [authUtil.includes('fetchMyBlocklist') && authUtil.includes("rpc('my_blocklist')"), 'blocklist reads must prefer the private RPC'],
    ];
    for (const [ok, name] of checks) {
      results.push({ name: `9.4 ${name}`, passed: ok, duration: 0 });
    }
    void viewsStart;
  } catch (err: any) {
    results.push({ name: '9.4 view routing inspection', passed: false, duration: Date.now() - viewsStart, error: err?.message });
  }

  return results;
}

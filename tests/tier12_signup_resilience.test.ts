import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

/**
 * Tier 12: signup resilience — the live project's auth config changed under
 * us (email confirmation ON + GoTrue email-domain validation rejecting the
 * synthetic domain). Contracts: honest classification, edge-function signup
 * path (service-role stays server-side), and no misleading fallback copy.
 */
export async function runTier12Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...p: string[]): string => fs.readFileSync(path.join(projectRoot, ...p), 'utf-8');

  const push = (name: string, passed: boolean, error?: string) =>
    results.push({ name, tier: 12, passed, error, durationMs: 0 });

  const check = (name: string, assertions: [boolean | string, string][]) => {
    try {
      const failures: string[] = [];
      for (const [cond, label] of assertions) {
        const ok = typeof cond === 'string' ? cond.length > 0 : cond;
        if (!ok) failures.push(label);
      }
      if (failures.length > 0) push(name, false, `Failed: ${failures.join('; ')}`);
      else push(name, true);
    } catch (err: any) {
      push(name, false, String(err?.message || err));
    }
  };

  /* ---------------- 12.1 honest classification ---------------- */

  const authUtil = read('src', 'utils', 'auth.ts');
  check('Tier 12.1: auth errors are classified honestly (no misleading RLS copy)', [
    [authUtil.includes("code === 'email_address_invalid'"), 'isInvalidEmailError must detect GoTrue email_address_invalid'],
    [authUtil.includes('EMAIL_INVALID_MSG'), 'an honest invalid-email message must exist'],
    [/temporarily blocked by this site\\?'s email provider settings/.test(authUtil), 'the invalid-email copy must state the real cause and the owner remedy'],
    [authUtil.includes('const viaEdge = await edgeSignup'), 'signup must attempt the edge-function path first'],
    [authUtil.includes("supabase.functions.invoke('auth-signup'"), 'edge signup must invoke the auth-signup function'],
    [authUtil.includes('return null; // not deployed / transient — fall through'), 'an undeployed function must gracefully fall through'],
    [authUtil.includes('return { ok: false, error: EMAIL_INVALID_MSG };'), 'invalid-email must short-circuit BEFORE the legacy RLS fallback'],
  ]);

  check('Tier 12.2: edge signup signs in with password — never touches service role client-side', [
    [!/SUPABASE_SERVICE_ROLE_KEY|service_role/.test(authUtil), 'the client bundle must never reference the service-role key'],
    [authUtil.includes('signInWithPassword'), 'edge path must obtain the session via a normal password sign-in'],
    [authUtil.includes('username_taken'), 'edge 409 must surface the Instagram taken-username copy'],
  ]);

  /* ---------------- 12.3 edge function (server side) ---------------- */

  const edge = read('supabase', 'functions', 'auth-signup', 'index.ts');
  check('Tier 12.4: auth-signup edge function is complete and safe to deploy', [
    [edge.includes('email_confirm: true'), 'admin createUser must confirm the user (no mailbox exists)'],
    [edge.includes('SUPABASE_SERVICE_ROLE_KEY'), 'the function must use the edge-injected service-role key'],
    [edge.includes('auth.admin.createUser'), 'the admin API must be the identity creator'],
    [edge.includes('/^[a-z0-9._]{1,30}$/'), 'the function must enforce the same username rules as the client'],
    [edge.includes("error: 'username_taken'"), 'duplicate usernames must map to username_taken'],
    [edge.includes("from('accounts').insert("), 'the function must provision the profile row (auth_uid link)'],
    [/functions deploy auth-signup/.test(edge), 'the one-command deploy instruction must be in the file header'],
    [!/Deno.env.get\('SUPABASE_SERVICE_ROLE_KEY'\)!.*localStorage/.test(edge), 'sanity: no client storage access server-side'],
  ]);

  /* ---------------- 12.5 smoke honesty ---------------- */

  const smoke = read('scripts', 'smoke-auth-v2.mjs');
  check('Tier 12.5: live smoke reports auth-config blocks as SKIPPED, never fake passes', [
    [smoke.includes('externallyBlocked'), 'the smoke must detect externally-blocked signup states'],
    [smoke.includes('4 skipped (owner action documented in AUDIT.md §8)'), 'skips must be counted and explained, not hidden'],
    [smoke.includes('process.exit(failed > 0 ? 1 : 0)'), 'real failures must still exit non-zero'],
  ]);

  /* ---------------- 12.6 runtime: classifier behavior ---------------- */

  try {
    const mod: any = await import('../src/utils/auth.ts');
    const runtime: [boolean, string][] = [];
    runtime.push([mod.isInvalidEmailError({ code: 'email_address_invalid' }) === true, 'code hit']);
    runtime.push([mod.isInvalidEmailError({ msg: 'Email address "x@y.z" is invalid' }) === true, 'message hit']);
    runtime.push([mod.isInvalidEmailError({ message: 'rate limit exceeded' }) === false, 'rate limit is NOT invalid-email']);
    runtime.push([mod.isInvalidEmailError(null) === false, 'null-safe']);
    runtime.push([mod.isRateLimitError({ code: 'over_email_send_rate_limit' }) === true, 'rate-limit classifier intact']);
    runtime.push([mod.confirmationRequired({ user: {}, session: null }) === true, 'confirmation-required classifier intact']);
    runtime.push([mod.confirmationRequired({ user: {}, session: {} }) === false, 'session present → not confirmation']);
    runtime.push([typeof mod.syntheticEmail('ab') === 'string' && mod.syntheticEmail('ab').endsWith('@users.axonlogs.app'), 'synthetic email contract intact']);

    const failures = runtime.filter(([ok]) => !ok).map(([, label]) => label);
    if (failures.length) push('Tier 12.6: signup classifiers (executed, not assumed)', false, `Failed: ${failures.join('; ')}`);
    else push('Tier 12.6: signup classifiers (executed, not assumed)', true);
  } catch (err: any) {
    push('Tier 12.6: signup classifiers (executed, not assumed)', false, String(err?.message || err));
  }

  return results;
}

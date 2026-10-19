import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

/**
 * Tier 13: contact-based auth (owner spec 2026-10-19).
 *
 * A new account signs up with a REAL email OR mobile number — whichever the
 * user prefers. Verification happens ONCE at signup (email link / SMS OTP)
 * and again only for password changes. Username stays the public identity.
 * Contracts here cover the pure parsing, the GoTrue routing, the honest
 * pending states, login-by-any-identifier, the verified password change and
 * the /reset flow.
 */
export async function runTier13Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...p: string[]): string => fs.readFileSync(path.join(projectRoot, ...p), 'utf-8');

  const push = (name: string, passed: boolean, error?: string) =>
    results.push({ name, tier: 13, passed, error, durationMs: 0 });

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

  /* ---------------- 13.1 contact parsing ---------------- */

  const authUtil = read('src', 'utils', 'auth.ts');
  check('Tier 13.1: contact parsing accepts real emails and E.164 mobiles, nothing loose', [
    [authUtil.includes('export const parseContact'), 'parseContact must be exported'],
    [authUtil.includes('export const validateContact'), 'validateContact must be exported'],
    [authUtil.includes("return raw.includes('@')"), 'invalid input must be classified as email vs mobile for the error copy'],
    [/\[1-9\]\\d\{7,14\}/.test(authUtil), 'mobile numbers must validate as E.164 (+, country code, 8-15 digits)'],
    [authUtil.includes("like +91 98765 43210"), 'the mobile error copy must show the country-code format'],
    [authUtil.includes('maskContact'), 'contacts must render masked on confirmation screens'],
  ]);

  /* ---------------- 13.2 signup routing ---------------- */

  check('Tier 13.2: signup routes a real email through native Supabase Auth (no synthetic fallback)', [
    [authUtil.includes('export const signupWithContact'), 'signupWithContact must be exported'],
    [authUtil.includes('supabase.auth.signUp({'), 'the email route must call auth.signUp with the REAL address'],
    [authUtil.includes('options: { data: { username: u, avatar_gradient: avatarGradient } }'), 'the username must ride along in user metadata for later logins'],
    [authUtil.includes("pending: 'confirm_email'"), 'email confirmation must be a PENDING state, not an error'],
    [authUtil.includes("'An account with this email already exists. Try logging in.'"), 'a taken email must get its own honest copy'],
    [authUtil.includes("rejected that address. Try another one."), 'a provider-rejected address must say so without blaming the user'],
    [!/syntheticEmail/.test(authUtil.slice(authUtil.indexOf('export const signupWithContact'), authUtil.indexOf('export const verifySignupOtp'))), 'signupWithContact must never fall back to the synthetic email'],
  ]);

  check('Tier 13.3: mobile route sends an OTP and verifies it with type signup', [
    [authUtil.includes('supabase.auth.signUpWithPhone'), 'the mobile route must use auth.signUpWithPhone'],
    [authUtil.includes("verifyOtp({ phone, token: code, type: 'signup' })"), 'OTP verification must be type signup'],
    [authUtil.includes('export const verifySignupOtp'), 'verifySignupOtp must be exported'],
    [authUtil.includes('export const PHONE_SETUP_MSG'), 'a missing SMS provider must be its own classified state'],
    [/\/sms\|phone\|twilio\|messagebird\|vonage\/i/.test(authUtil), 'SMS-provider errors must be detected by provider name'],
    [authUtil.includes("isn't right. Check the SMS and try again."), 'a wrong OTP must get Instagram-style honest copy'],
  ]);

  /* ---------------- 13.3 login by any identifier ---------------- */

  check('Tier 13.4: login accepts username, email OR mobile — with honest wrong-password copy', [
    [/export const loginAccount = async \(\s*\n\s*supabase: any,\s*\n\s*identifier: string,/.test(authUtil), 'loginAccount must take a generic identifier'],
    [authUtil.includes('const contact = parseContact(raw);'), 'the identifier must be parsed to email/phone/username'],
    [authUtil.includes('...authTarget,') , 'the sign-in must target the parsed identifier (email, phone or synthetic username email)'],
    [authUtil.includes('user_metadata?.username'), 'contact logins must resolve the public username from auth metadata'],
    [authUtil.includes('Signed up with a username? Log in with that instead.'), 'wrong contact credentials must point users back to their username'],
    [authUtil.includes('if (contact) {') && authUtil.includes('// Contact-identifier accounts have no legacy row'), 'contact identifiers must skip the legacy PBKDF2 path'],
  ]);

  /* ---------------- 13.4 verified password change + reset ---------------- */

  check('Tier 13.5: password changes are verified with the current password first', [
    [authUtil.includes('export const verifyCurrentPassword'), 'verifyCurrentPassword must be exported'],
    [authUtil.includes('user.phone'), 'the re-auth must use the session user\'s own identifier (mobile first)'],
    [authUtil.includes("{ email: user.email || syntheticEmail('') }"), 'legacy sessions must re-auth via their synthetic email'],
    [authUtil.includes("'Your current password is incorrect.'"), 'a wrong current password must be named as such'],
    [read('src', 'components', 'settings', 'SettingsPanel.tsx').includes('verifyCurrentPassword(supabase, currentPassword)'), 'Settings must verify BEFORE updateUser'],
    [read('src', 'components', 'settings', 'SettingsPanel.tsx').includes("Current password — proves it's you"), 'the form must ask for the current password'],
  ]);

  const resetPanel = read('src', 'components', 'auth', 'ResetPasswordPanel.tsx');
  check('Tier 13.6: forgot-password sends a one-time link to /reset which sets the new password', [
    [authUtil.includes('resetPasswordForEmail'), 'the reset must go through auth.resetPasswordForEmail'],
    [authUtil.includes('redirectTo: `${window.location.origin}/reset`'), 'the recovery link must open /reset on this site'],
    [authUtil.includes('export const completePasswordReset'), 'completePasswordReset must be exported'],
    [resetPanel.includes('completePasswordReset'), 'the reset panel must call the real completion'],
    [resetPanel.includes('hasSession'), 'the panel must distinguish a recovery session from a bare visit'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes("if (p.startsWith('/reset')) return 'reset';"), '/reset must be a routed pane'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes("<ResetPasswordPanel onBack={() => go('/direct')} />"), 'the reset pane must render ResetPasswordPanel'],
  ]);

  /* ---------------- 13.7 AuthScreen wiring ---------------- */

  const screen = read('src', 'components', 'auth', 'AuthScreen.tsx');
  check('Tier 13.7: the auth screen walks all five modes with private-by-default copy', [
    [screen.includes("placeholder={mode === 'login' ? 'username, email or mobile' : 'username'}"), 'login must advertise all three identifiers'],
    [screen.includes('inputMode="email"') && screen.includes('placeholder="email or mobile number"'), 'signup must collect the real contact'],
    [screen.includes('Verified once with a link or a text code. Used only for account security — never shown to anyone.'), 'the privacy promise must be on-screen'],
    [screen.includes("mode === 'confirm'"), 'the email-confirmation pending screen must exist'],
    [screen.includes("mode === 'otp'"), 'the SMS OTP screen must exist'],
    [screen.includes('We sent a verification link to'), 'the confirm screen must show the masked destination'],
    [screen.includes('Enter the code we texted to'), 'the OTP screen must show the masked number'],
  ]);

  check('Tier 13.8: forgot-password link is reachable from login', [
    [screen.includes("onClick={() => switchMode('forgot')}"), 'login must offer Forgot password?'],
    [screen.includes('Send recovery link'), 'the forgot form must send the recovery email'],
    [screen.includes('RECOVERY'), 'the titlebar must reflect the recovery mode'],
  ]);

  /* ---------------- 13.9 privacy contract ---------------- */

  check('Tier 13.9: contact details stay inside auth.users — never in public rows', [
    [!/contact_email|contact_phone/.test(authUtil), 'no contact columns may be written client-side'],
    [!/\.from\('accounts'\)[\s\S]{0,80}email/.test(authUtil), 'accounts inserts must not carry email data'],
    [authUtil.includes('maskContact(contact)'), 'pending states must hand the screen a MASKED contact'],
  ]);

  return results;
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';
import {
  validateChatLockPassword,
  generateChatLockSalt,
  deriveChatLockVerifier,
  setChatLockRuntimeState,
  isPrivacyLocked,
  isChatProtected,
  markChatUnlocked,
  lockConversation,
  lockAllConversations,
  getAutoLockOnHide,
  getChatLockEnabledState,
  chatLockProtectedIds,
  resetChatLockRuntime,
  CHAT_LOCK_ITERATIONS,
  CHAT_LOCK_MIN_LENGTH,
} from '../src/utils/chatLockCore.ts';
import {
  validatePassword,
  passwordByteLength,
  PASSWORD_MIN,
  PASSWORD_MAX_BYTES,
} from '../src/utils/auth.ts';

/**
 * Tier 14: six-digit email OTP, six-digit recovery, password policy and
 * Chat Lock (master-prompt Phases 2-4).
 *
 * Runtime-tested here: chat-lock crypto/state machine (the exact module the
 * app imports), the password policy (no composition rules, provider floor,
 * 72-byte bcrypt ceiling). Structure-tested: schema SECTION 8 (tables, RLS,
 * the rate-limited verify RPC), the OTP screens, the recovery flow, the
 * global re-lock triggers, inbox masking and the Auth config contract.
 */
export async function runTier14Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...p: string[]): string => fs.readFileSync(path.join(projectRoot, ...p), 'utf-8');

  const push = (name: string, passed: boolean, error?: string) =>
    results.push({ name, tier: 14, passed, error, durationMs: 0 });

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

  /* ---------------- 14.1 password policy: no composition rules ---------------- */

  check('Tier 14.1: passwords have NO composition rules — only provider-grounded limits', [
    [validatePassword('correct horse battery staple') === null, 'long passphrases with spaces must pass'],
    [validatePassword('aaaaaaaa') === null, 'all-lowercase must pass (no forced uppercase)'],
    [validatePassword('12345678') === null, 'all-digits must pass (no forced letters)'],
    [validatePassword('!!!!!!!!') === null, 'all-symbols must pass (no forced alphanumerics)'],
    [validatePassword('çæü密碼パスワード') === null, 'unicode passphrases must pass'],
    [validatePassword('short') !== null, 'below the provider floor must fail'],
    [validatePassword('x'.repeat(72)) === null, '72 bytes must pass (bcrypt ceiling)'],
    [validatePassword('x'.repeat(73)) !== null, '73 bytes must fail (bcrypt would silently truncate)'],
    [passwordByteLength('ç') === 2, 'byte length must count UTF-8 bytes, not characters'],
    [PASSWORD_MIN === 8, 'floor must be 8 (project password_min_length)'],
    [PASSWORD_MAX_BYTES === 72, 'ceiling must be 72 bytes (provider hash limit)'],
    [!/\bregex\b.*uppercase|must contain (upper|lower|digit|special)/i.test(read('src', 'utils', 'auth.ts')), 'no composition-rule helpers may exist in auth.ts'],
  ]);

  /* ---------------- 14.2 chat-lock crypto ---------------- */

  try {
    const salt = generateChatLockSalt();
    const v1 = await deriveChatLockVerifier('open sesame', salt);
    const v2 = await deriveChatLockVerifier('open sesame', salt);
    const v3 = await deriveChatLockVerifier('open sesame!', salt);
    const v4 = await deriveChatLockVerifier('open sesame', generateChatLockSalt());
    check('Tier 14.2: PBKDF2-SHA256 verifier derivation is deterministic and salted', [
      [salt.length === 32, 'salt must be 16 random bytes as hex'],
      [/^[0-9a-f]{64}$/.test(v1), 'verifier must be 256-bit hex'],
      [v1 === v2, 'same password + salt must derive the same verifier'],
      [v1 !== v3, 'a different password must derive a different verifier'],
      [v1 !== v4, 'a different salt must derive a different verifier'],
      [CHAT_LOCK_ITERATIONS >= 300_000, 'iterations must stay at OWASP-scale (>=300k)'],
    ]);
  } catch (err: any) {
    push('Tier 14.2: PBKDF2-SHA256 verifier derivation is deterministic and salted', false, String(err?.message || err));
  }

  check('Tier 14.3: chat-lock passcode rules are minimal (no composition rules)', [
    [validateChatLockPassword('abcd') === null, '4 characters must pass'],
    [validateChatLockPassword('ab') !== null, 'below 4 must fail with the floor message'],
    [validateChatLockPassword('') !== null, 'empty must fail'],
    [CHAT_LOCK_MIN_LENGTH === 4, 'the exported floor constant must be 4'],
  ]);

  /* ---------------- 14.4 unlock state machine (in-memory only) ---------------- */

  try {
    resetChatLockRuntime();
    setChatLockRuntimeState({ enabled: true, autoLockOnHide: true, protectedChatIds: ['chat-a', 'chat-b'] });

    const t1 = isPrivacyLocked('chat-a');
    markChatUnlocked('chat-a');
    const t2 = isPrivacyLocked('chat-a');
    const t3 = isPrivacyLocked('chat-b');
    const locked = lockAllConversations();
    const t4 = isPrivacyLocked('chat-a');

    setChatLockRuntimeState({ enabled: false, autoLockOnHide: true, protectedChatIds: ['chat-a'] });
    const t5 = isPrivacyLocked('chat-a');
    setChatLockRuntimeState({ enabled: true, autoLockOnHide: false, protectedChatIds: ['chat-a'] });
    markChatUnlocked('chat-a');
    const t6 = lockConversation('chat-a');

    resetChatLockRuntime();
    const t7 = isPrivacyLocked('chat-a');

    check('Tier 14.4: unlock state is tab-session memory — re-locks on lock-all, disable and reset', [
      [t1 === true, 'a protected conversation must start locked'],
      [t2 === false, 'markChatUnlocked must open it for this session'],
      [t3 === true, 'other protected conversations stay locked'],
      [locked.includes('chat-a'), 'lockAllConversations must report what it locked'],
      [t4 === true, 'lockAllConversations must re-lock everything'],
      [t5 === false, 'a disabled master switch unlocks everything'],
      [t6 === true, 'lockConversation must re-lock a single chat'],
      [t7 === false, 'after reset nothing may look locked'],
      [getChatLockEnabledState() === false, 'runtime master switch must reset'],
      [chatLockProtectedIds().length === 0, 'runtime protected set must reset'],
      [getAutoLockOnHide() === true, 'auto-lock-on-hide must default to strict'],
    ]);
  } catch (err: any) {
    push('Tier 14.4: unlock state is tab-session memory — re-locks on lock-all, disable and reset', false, String(err?.message || err));
  }

  check('Tier 14.5: unlock state is NEVER persisted to web storage', [
    [/localStorage\.|sessionStorage\./.test(read('src', 'utils', 'chatLockCore.ts')) === false, 'chatLockCore must not call web storage APIs'],
    [!/(set|get)Item\(.chat.?lock/i.test(read('src', 'utils', 'chatLock.ts')), 'the server-sync layer must not cache the passcode or unlock state'],
  ]);

  /* ---------------- 14.6 schema SECTION 8 contracts ---------------- */

  const schema = read('supabase', 'schema.sql');
  check('Tier 14.6: schema SECTION 8 ships owner-only RLS for both chat-lock tables', [
    [schema.includes('create table if not exists public.chat_lock_settings'), 'chat_lock_settings must exist'],
    [schema.includes('create table if not exists public.conversation_locks'), 'conversation_locks must exist'],
    [schema.includes('alter table public.chat_lock_settings enable row level security'), 'chat_lock_settings RLS must be enabled'],
    [schema.includes('alter table public.conversation_locks enable row level security'), 'conversation_locks RLS must be enabled'],
    [schema.includes('"chat lock settings are owner-only"'), 'settings policy must be owner-only by name'],
    [schema.includes('"conversation locks are owner-only"'), 'locks policy must be owner-only by name'],
    [/create policy "chat lock settings are owner-only"[\s\S]*?using \(auth\.uid\(\) = user_id\)/.test(schema), 'settings policy must scope on auth.uid()'],
    [schema.includes('public.is_chat_member(chat_id, public.my_username())'), 'conversation locks must require membership in WITH CHECK'],
    [schema.includes("references auth.users(id) on delete cascade"), 'both tables must cascade from the auth user'],
  ]);

  check('Tier 14.7: verify_chat_lock RPC exists, is definer-scoped and rate-limits misses', [
    [schema.includes("create or replace function public.verify_chat_lock(p_verifier text)"), 'the RPC must exist'],
    [/verify_chat_lock[\s\S]*?security definer/.test(schema), 'the RPC must be SECURITY DEFINER'],
    [/verify_chat_lock[\s\S]*?locked_until is not null and v_row\.locked_until > now\(\)/.test(schema), 'must refuse while the cool-down is active'],
    [/verify_chat_lock[\s\S]*?failed_attempts \+ 1 >= 5/.test(schema), 'must hard-lock from the 5th consecutive miss'],
    [/revoke execute on function public\.verify_chat_lock\(text\) from public, anon/.test(schema), 'must revoke the implicit PUBLIC grant'],
    [schema.includes("grant execute on function public.verify_chat_lock(text) to authenticated"), 'must grant execute to authenticated'],
    [schema.includes("never reaches the server"), 'the comment block must state the plaintext never reaches the server'],
  ]);

  check('Tier 14.8: SECTION 8 statements are ordered safely for fresh databases', [
    [schema.indexOf('create table if not exists public.chat_lock_settings') < schema.indexOf('create policy "chat lock settings are owner-only"'), 'settings table must precede its policy'],
    [schema.indexOf('create table if not exists public.conversation_locks') < schema.indexOf('public.is_chat_member(chat_id, public.my_username())'), 'locks table must precede the membership check'],
    [schema.indexOf('create or replace function public.is_chat_member') < schema.indexOf('create table if not exists public.conversation_locks'), 'is_chat_member (SECTION 5) must precede SECTION 8 usage'],
  ]);

  /* ---------------- 14.9 six-digit signup + legacy gate contracts ---------------- */

  const authUtil = read('src', 'utils', 'auth.ts');
  const authScreen = read('src', 'components', 'auth', 'AuthScreen.tsx');
  const otpInput = read('src', 'components', 'auth', 'OtpInput.tsx');

  check('Tier 14.9: signup verifies a six-digit EMAIL code through native GoTrue', [
    [authUtil.includes('export const verifySignupEmailOtp'), 'the email OTP verifier must be exported'],
    [authUtil.includes("type: 'signup'"), 'verification must run through verifyOtp type signup'],
    [authUtil.includes("auth.verifyOtp({ email, token: code, type: 'signup' })") || /verifyOtp\(\{ email, token: code, type: 'signup' \}\)/.test(authUtil), 'the email route must verify server-side'],
    [authUtil.includes('/expired/i'), 'expired codes must get their own message'],
    [authUtil.includes('export const resendPhoneOtp'), 'SMS resend must exist alongside email resend'],
    [authScreen.includes('<OtpInput'), 'the auth screen must render the six-box input'],
    [authScreen.includes('onComplete={doSignupOtp}'), 'the code must submit on completion'],
    [otpInput.includes('one-time-code'), 'the first box must advertise the OTP autocomplete hint'],
    [otpInput.includes('handlePaste'), 'full-code paste must be supported'],
    [otpInput.includes('Digit ${i + 1} of ${length}'), 'each box must be screen-reader labelled'],
    [otpInput.includes("maxLength={length}"), 'pasting into a single box must not truncate silently'],
  ]);

  check('Tier 14.10: legacy unverified accounts are gated, not locked out', [
    [authUtil.includes('isEmailNotConfirmedError'), 'the unconfirmed-email classifier must exist'],
    [authUtil.includes("error.code === 'email_not_confirmed'"), 'the GoTrue code must be matched directly'],
    [authUtil.includes('needsVerification: true'), 'login must flag the verification gate'],
    [authScreen.includes("setMode('verify')"), 'the auth screen must route into one-time verification'],
    [authScreen.includes('Verify your email — once'), 'the verification screen must promise the account stays intact'],
    [authScreen.includes('conversations all stay exactly as they are'), 'legacy users must be told nothing is lost'],
    [authUtil.includes('auth.resend({ type:'), 'resend must go through the provider'],
  ]);

  /* ---------------- 14.11 recovery flow contracts ---------------- */

  check('Tier 14.11: password recovery is a separate six-digit code with session revocation', [
    [authUtil.includes("type: 'recovery'"), 'recovery must verify through verifyOtp type recovery — never reusable as login'],
    [authUtil.includes('export const verifyRecoveryOtp'), 'the recovery verifier must be exported'],
    [authUtil.includes('export const signOutOtherSessions'), 'session revocation must be a first-class helper'],
    [authUtil.includes("signOut({ scope: 'others' }"), 'other sessions must be revoked with scope others'],
    [authUtil.includes('signOutOthers: boolean = true'), 'revoke-others must default to ON'],
    [authScreen.includes('setForgotStep'), 'the forgot flow must be multi-step'],
    [authScreen.includes('Log out other devices after the reset'), 'the revocation choice must be explicit and explained'],
    [authScreen.includes("The two passwords don't match.") || authScreen.includes("The two passwords don't match yet."), 'mismatch feedback must be present'],
    [authScreen.includes("showRp ? 'text' : 'password'"), 'the reset form must have a visibility toggle'],
    [authScreen.includes("recovery code is now dead"), 'the success state must state the code is consumed'],
    [authUtil.includes("we never modify your password") || authUtil.includes('never trimmed'), 'the no-trim policy must be documented in code'],
  ]);

  /* ---------------- 14.12 chat lock wiring contracts ---------------- */

  const convo = read('src', 'components', 'chat', 'ConversationPanel.tsx');
  const chatApp = read('src', 'components', 'layout', 'ChatApp.tsx');
  const inbox = read('src', 'components', 'chat', 'InboxPanel.tsx');
  const ctx = read('src', 'contexts', 'CryptoContext.tsx');
  const settings = read('src', 'components', 'settings', 'SettingsPanel.tsx');

  check('Tier 14.12: the lock gate replaces the conversation body — not a cosmetic overlay', [
    [convo.includes('const ChatLockGate'), 'the gate component must exist'],
    [convo.includes('privacyLocked ? (\n            <ChatLockGate'), 'the gate must render INSTEAD of the message list'],
    [convo.includes(") : privacyLocked ? null : blockedPeer ? ("), 'the composer must be unmounted while locked'],
    [convo.includes('verifyChatLockPassword'), 'unlock must verify against the server'],
    [convo.includes('markChatUnlocked'), 'unlock must go through the tab-session registry'],
    [convo.includes("'Protect with chat lock'"), 'conversations must be protectable from their menu'],
    [convo.includes('setConversationLocked'), 'protection must persist server-side'],
  ]);

  check('Tier 14.13: refresh, tab hide and route changes all re-lock', [
    [chatApp.includes("'visibilitychange'"), 'tab hide must trigger locking'],
    [chatApp.includes('document.hidden && getAutoLockOnHide()'), 'locking on hide must honor the user policy'],
    [chatApp.includes("'pagehide'"), 'page navigation away must trigger locking'],
    [chatApp.includes('[lockRoute.pathname]'), 'route changes must trigger locking'],
    [chatApp.includes('lockAllConversations()'), 'the lock-all sweep must be used'],
    [chatApp.includes('scrubConversation'), 'locked conversations must be scrubbed from memory'],
    [chatApp.includes('bumpMessagesReload'), 'unlock must force a fresh message fetch'],
    [ctx.includes('if (isPrivacyLocked(activeChat.id))'), 'the message fetch must refuse while privacy-locked'],
    [ctx.includes("if (isPrivacyLocked(activeChat.id)) return; // Chat Lock gate"), 'realtime payloads must not decrypt while locked'],
    [inbox.includes("'🔒 Locked — unlock to read'"), 'inbox previews must mask locked conversations'],
    [inbox.includes('lockTick'), 'the inbox must re-render when lock state changes'],
  ]);

  check('Tier 14.14: settings ships the full chat-lock lifecycle', [
    [settings.includes('ChatLockCard'), 'the settings card must exist'],
    [settings.includes('enableChatLock'), 'enabling with a fresh passcode'],
    [settings.includes('changeChatLockPassword'), 'passcode change with old-passcode proof'],
    [settings.includes('disableChatLock'), 'removal unlocks every chat'],
    [settings.includes('setChatLockAutoLock'), 'the auto-lock policy must be configurable'],
    [settings.includes("new CustomEvent('axon:chat-lock-changed')"), 'settings changes must notify the shell'],
    [settings.includes('privacy screen, not extra encryption'), 'the honest-limits note must be present'],
    [settings.includes('validatePassword(newPassword)'), 'account password changes must apply the same policy'],
    [settings.includes('PASSWORD_MIN'), 'the account password copy must use the policy constant'],
  ]);

  check('Tier 14.15: the schema validation harness covers SECTION 8', [
    [fs.existsSync(path.join(projectRoot, 'scripts', 'validate-schema.mjs')), 'the harness must exist'],
    [read('scripts', 'validate-schema.mjs').includes('chat_lock_settings'), 'the contract checks must assert the new tables'],
    [read('scripts', 'validate-schema.mjs').includes('verify_chat_lock'), 'the contract checks must assert the RPC'],
  ]);

  return results;
}

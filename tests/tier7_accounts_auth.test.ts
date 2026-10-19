import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

/**
 * Tier 7: Accounts & DM Delivery Contract
 * - AuthScreen exists and gates the app (username + password accounts)
 * - Password hashing is PBKDF2 (crypto-js), verified locally
 * - CryptoContext exposes account / logout / searchAccounts / startDmWithUser
 * - DM display-name logic shows the OTHER handle (Instagram behavior)
 * - supabase/schema.sql provisions accounts + dm_invites (+ realtime)
 * - No story/note strip in the inbox (no stories, no reels, no posts)
 * - Mac window chrome restored (traffic-light titlebar + tmux statusbar)
 */
export async function runTier7Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...parts: string[]) =>
    fs.readFileSync(path.join(projectRoot, ...parts), 'utf-8');

  // 7.1: Auth gate + PBKDF2 password hashing
  const authStart = Date.now();
  try {
    const authUtil = read('src', 'utils', 'auth.ts');
    const authScreen = read('src', 'components', 'auth', 'AuthScreen.tsx');
    const appTsx = read('src', 'App.tsx');
    const secNote = read('src', 'components', 'ui', 'SecurityNote.tsx');
    const profilePanel = read('src', 'components', 'profile', 'ProfilePanel.tsx');
    const settingsPanel = read('src', 'components', 'settings', 'SettingsPanel.tsx');
    const chatApp = read('src', 'components', 'layout', 'ChatApp.tsx');

    const checks: Array<[boolean, string]> = [
      [authUtil.includes('CryptoJS.PBKDF2'), 'auth.ts must hash passwords with CryptoJS.PBKDF2'],
      [authUtil.includes('verifyPassword'), 'auth.ts must verify passwords locally'],
      [authUtil.includes('signupAccount') && authUtil.includes('loginAccount'), 'auth.ts must implement signup + login'],
      [authUtil.includes("SESSION_KEY = 'axon_session'"), 'auth.ts must persist the account session'],
      [authScreen.includes("'username, email or mobile' : 'username'"), 'AuthScreen must collect a username (login accepts email/mobile too)'],
      [authUtil.includes('validateUsername') && authScreen.includes('validateUsername'), 'AuthScreen must validate the username'],
      [appTsx.includes('AuthScreen') && appTsx.includes('account'), 'App.tsx must gate ChatApp behind the account session'],
      [secNote.includes("Your password is scrambled on your device before it's saved") && secNote.includes('Only you and the person you message can read your chats.'), 'SecurityNote must highlight both security guarantees in plain language'],
      [authScreen.includes('SecurityNote'), 'AuthScreen must show the highlighted security note'],
      [profilePanel.includes('SecurityNote'), 'ProfilePanel must show the highlighted security note'],
      [settingsPanel.includes('SecurityNote'), 'SettingsPanel must show the highlighted security note'],
      [chatApp.includes('SecurityNote'), 'ChatApp welcome state must show the highlighted security note'],
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
    if (failed.length > 0) throw new Error(failed.join('; '));

    results.push({
      name: 'Tier 7.1: Account auth gate + PBKDF2 password hashing',
      tier: 7,
      passed: true,
      durationMs: Date.now() - authStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 7.1: Account auth gate + PBKDF2 password hashing',
      tier: 7,
      passed: false,
      error: err.message,
      durationMs: Date.now() - authStart,
    });
  }

  // 7.2: DM flow — context API + other-handle display + invite delivery
  const dmStart = Date.now();
  try {
    const ctx = read('src', 'contexts', 'CryptoContext.tsx');
    const inbox = read('src', 'components', 'chat', 'InboxPanel.tsx');
    const authUtil = read('src', 'utils', 'auth.ts');
    const schema = read('supabase', 'schema.sql');

    // dmDisplayName('alice·bob sorted') behavior is structural: sorted join with ·
    const dmNameSorted = authUtil.includes('.sort()');
    const checks: Array<[boolean, string]> = [
      [ctx.includes('startDmWithUser'), 'CryptoContext must expose startDmWithUser'],
      [ctx.includes('searchAccounts'), 'CryptoContext must expose searchAccounts'],
      [ctx.includes('loginWithAccount') && ctx.includes('logout'), 'CryptoContext must expose loginWithAccount + logout'],
      [ctx.includes("table: 'dm_invites'"), 'CryptoContext must subscribe to dm_invites for DM delivery'],
      [ctx.includes('fetchMyDmInvites'), 'CryptoContext must backfill DM invites on login'],
      [authUtil.includes('dmChatName') && dmNameSorted, 'DM channel names must be deterministic (sorted handles)'],
      [authUtil.includes('generateDmPasscode'), 'DM channels must use an invite-delivered passphrase'],
      [inbox.includes('searchAccounts') && inbox.includes('Message'), 'Inbox must surface account search with a Message action'],
      [schema.includes('create table if not exists public.accounts'), 'schema.sql must create accounts'],
      [schema.includes('create table if not exists public.dm_invites'), 'schema.sql must create dm_invites'],
      [schema.includes('tablename = \'dm_invites\''), 'schema.sql must add dm_invites to the realtime publication'],
      [schema.includes('idx_accounts_username'), 'schema.sql must index usernames for search'],
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
    if (failed.length > 0) throw new Error(failed.join('; '));

    results.push({
      name: 'Tier 7.2: DM accounts flow (search → Message → invite auto-join)',
      tier: 7,
      passed: true,
      durationMs: Date.now() - dmStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 7.2: DM accounts flow (search → Message → invite auto-join)',
      tier: 7,
      passed: false,
      error: err.message,
      durationMs: Date.now() - dmStart,
    });
  }

  // 7.3: No stories/notes strip + Mac window chrome restored
  const themeStart = Date.now();
  try {
    const inbox = read('src', 'components', 'chat', 'InboxPanel.tsx');
    const chatApp = read('src', 'components', 'layout', 'ChatApp.tsx');
    const indexCss = read('src', 'index.css');

    const checks: Array<[boolean, string]> = [
      [!inbox.includes('Your note'), 'Inbox must NOT render the "Your note" story strip'],
      [inbox.includes('Accounts'), 'Inbox must show the Accounts search section'],
      [chatApp.includes('term-titlebar') && chatApp.includes('tl-red'), 'ChatApp must restore the macOS traffic-light titlebar'],
      [chatApp.includes('term-statusbar'), 'ChatApp must restore the tmux-style statusbar'],
      [chatApp.includes('term-window'), 'ChatApp must render inside the Mac term-window chrome'],
      [indexCss.includes('.tl-red') && indexCss.includes('.term-titlebar'), 'index.css must keep the traffic-light + titlebar styles'],
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
    if (failed.length > 0) throw new Error(failed.join('; '));

    results.push({
      name: 'Tier 7.3: Story-free inbox + restored Mac window chrome',
      tier: 7,
      passed: true,
      durationMs: Date.now() - themeStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 7.3: Story-free inbox + restored Mac window chrome',
      tier: 7,
      passed: false,
      error: err.message,
      durationMs: Date.now() - themeStart,
    });
  }

  // 7.4: Instagram username rules + unrestricted password policy (runtime)
  const rulesStart = Date.now();
  try {
    const authUtil = read('src', 'utils', 'auth.ts');
    const authScreen = read('src', 'components', 'auth', 'AuthScreen.tsx');

    // runtime behavior — actually execute the validators
    const mod: any = await import('../src/utils/auth.ts');
    const { validateUsername, validatePassword } = mod;
    const checks: Array<[boolean, string]> = [
      [validateUsername('ab') === null, '1-2 char usernames must be allowed (Instagram allows 1-30)'],
      [validateUsername('a'.repeat(30)) === null, '30-character usernames must be allowed'],
      [validateUsername('a'.repeat(31)) !== null, '31-character usernames must be rejected'],
      [validateUsername('') !== null, 'empty usernames must be rejected'],
      [validateUsername('john.doe_01') === null, 'letters/numbers/periods/underscores must be allowed'],
      [validateUsername('_leading_underscore') === null, 'leading underscores must be allowed (Instagram behavior)'],
      [validateUsername('.john') !== null, 'leading period must be rejected'],
      [validateUsername('john.') !== null, 'trailing period must be rejected'],
      [validateUsername('john doe') !== null, 'spaces must be rejected'],
      [validateUsername('john-doe') !== null, 'hyphens must be rejected'],
      [validateUsername('j@hn') !== null, 'special characters must be rejected'],
      [validatePassword('') === null, 'passwords must be unrestricted (no minimum)'],
      [validatePassword('a') === null, '1-char passwords must be allowed'],
      [validatePassword('p@$$w0rd 💪 with spaces') === null, 'unicode/space/symbol passwords must be allowed'],
      [validatePassword('x'.repeat(500)) === null, 'long passwords must be allowed (no maximum)'],
      // structural guards so a future edit can't silently re-add password rules
      [!authUtil.includes('Password must be at least'), 'auth.ts must not enforce a password minimum'],
      [!authUtil.includes('Password must be at most'), 'auth.ts must not enforce a password maximum'],
      [authUtil.includes('{1,30}'), 'username regex must implement the Instagram 1-30 rule'],
      [authScreen.includes('maxLength={30}'), 'AuthScreen username input must cap at 30 characters'],
      [authScreen.includes("This username isn't available"), 'AuthScreen must show the live availability result'],
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
    if (failed.length > 0) throw new Error(failed.join('; '));

    results.push({
      name: 'Tier 7.4: Instagram username rules + unrestricted passwords (runtime)',
      tier: 7,
      passed: true,
      durationMs: Date.now() - rulesStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 7.4: Instagram username rules + unrestricted passwords (runtime)',
      tier: 7,
      passed: false,
      error: err.message,
      durationMs: Date.now() - rulesStart,
    });
  }

  return results;
}

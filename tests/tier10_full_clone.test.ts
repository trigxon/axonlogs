import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

/**
 * Tier 10: Full Instagram-clone expansion — notifications, routed shell,
 * profiles, search, account lifecycle — PLUS the product's exclusion
 * contracts: stories (and their tables/components/routes) must NOT exist.
 * Structural + runtime contracts, same style as tiers 7-9.
 */
export async function runTier10Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...p: string[]): string => fs.readFileSync(path.join(projectRoot, ...p), 'utf-8');
  const exists = (...p: string[]): boolean => fs.existsSync(path.join(projectRoot, ...p));

  const push = (name: string, passed: boolean, error?: string) =>
    results.push({ name, tier: 10, passed, error, durationMs: 0 });

  const check = (name: string, assertions: [boolean | string, string][]) => {
    try {
      const failures: string[] = [];
      for (const [cond, label] of assertions) {
        const ok = typeof cond === 'string' ? cond.length > 0 : cond;
        if (!ok) failures.push(label);
      }
      if (failures.length > 0) {
        push(name, false, `Failed: ${failures.join('; ')}`);
      } else {
        push(name, true);
      }
    } catch (err: any) {
      push(name, false, String(err?.message || err));
    }
  };

  /* ---------------- 10.1 routed app shell ---------------- */

  check('Tier 10.1: App.tsx mounts the router and gates the shell', [
    [read('src', 'App.tsx').includes('BrowserRouter'), 'App.tsx must wrap the app in BrowserRouter'],
    [read('src', 'App.tsx').includes('AuthScreen') && read('src', 'App.tsx').includes('account'), 'App.tsx must keep the auth gate'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes('useLocation') && read('src', 'components', 'layout', 'ChatApp.tsx').includes('useNavigate'), 'ChatApp must drive panes from the router'],
  ]);

  check('Tier 10.1: ChatApp routes cover explore / notifications / profile / settings / 404 (NO /create)', [
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes("p.startsWith('/explore')"), 'missing /explore route'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes("p.startsWith('/notifications')"), 'missing /notifications route'],
    [!read('src', 'components', 'layout', 'ChatApp.tsx').includes("p.startsWith('/create')"), '/create (story composer) route must be gone'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes("/profile/"), 'missing /profile/:username route'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes('NotFoundPane'), 'missing in-app 404 pane'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes('MOBILE BOTTOM NAV'), 'missing mobile bottom navigation'],
  ]);

  /* ---------------- 10.2 stories backend (schema) ---------------- */

  const schema = read('supabase', 'schema.sql');

  check('Tier 10.2: no RLS policy reads its own table (recursion guard)', [
    // "infinite recursion detected in policy" happens when a policy body
    // queries its own table. All membership lookups must go through the
    // security-definer helpers (is_chat_member / can_dm_chat) instead.
    [((): boolean => {
      const policyBlocks = schema.split(/create policy /).slice(1);
      for (const block of policyBlocks) {
        const target = block.match(/on\s+(?:public\.)?(\w+)/);
        const body = block.slice(0, block.indexOf(';'));
        if (!target) continue;
        const t = target[1];
        if (new RegExp(`from\\s+(?:public\\.)?${t}\\b`).test(body) || new RegExp(`join\\s+(?:public\\.)?${t}\\b`).test(body)) {
          return false;
        }
      }
      return true;
    })(), 'a policy body must never query its own table (use the definer helpers)'],
    [schema.includes('create or replace function public.is_chat_member'), 'is_chat_member definer helper must exist'],
    [schema.includes('create or replace function public.can_dm_chat'), 'can_dm_chat definer helper must exist'],
    [schema.includes('public.is_chat_member(messages.chat_id, public.my_username())'), 'messages policies must use the definer helper'],
    [schema.includes('public.is_chat_member(chats.id, public.my_username())'), 'chats policies must use the definer helper'],
  ]);


  // The teardown section (6.8b) legitimately MENTIONS the removed objects in
  // drop statements — exclusion is asserted on everything BEFORE it.
  const schemaPre = schema.split('6.8b Stories teardown')[0];
  check('Tier 10.2: EXCLUSION — stories must not exist anywhere in the schema (spec: no stories)', [
    [!schemaPre.includes('create table if not exists public.stories'), 'stories table must not be created'],
    [!schemaPre.includes('create table if not exists public.story_views'), 'story_views table must not be created'],
    [!schemaPre.includes('create table if not exists public.highlights'), 'highlights table must not be created'],
    [!schemaPre.includes('create table if not exists public.highlight_stories'), 'highlight_stories table must not be created'],
    [!schemaPre.includes('create table if not exists public.close_friends'), 'close_friends table must not be created'],
    [!schemaPre.includes('can_view_story'), 'can_view_story helper must be gone'],
    [!schemaPre.includes("values ('story_media'"), 'story_media bucket must not be provisioned'],
  ]);

  check('Tier 10.2: idempotent teardown removes story objects from databases that had them', [
    [schema.includes('drop table if exists public.highlight_stories cascade'), 'teardown drops highlight_stories'],
    [schema.includes("drop table if exists public.stories cascade"), 'teardown drops stories'],
    [schema.includes("drop function if exists public.can_view_story(text, text, text)"), 'teardown drops can_view_story'],
    [schema.includes("delete from storage.buckets where id = 'story_media'"), 'teardown removes the story_media bucket'],
    [schema.includes('Stories are deliberately NOT part of Axon Logs'), 'teardown section must document the exclusion'],
  ]);

  /* ---------------- 10.3 notifications backend ---------------- */

  check('Tier 10.3: schema v2 notifications table + triggers + RLS', [
    [schema.includes('create table if not exists public.notifications'), 'notifications table missing'],
    [schema.includes('using (username = public.my_username())'), 'notifications must be readable only by their owner'],
    [schema.includes('with check (actor = public.my_username())'), 'client-inserted notifications must stamp the real actor'],
    [schema.includes('trg_follows_notify'), 'follow events must auto-notify via trigger'],
    [schema.includes('trg_dm_invites_notify'), 'message requests must auto-notify via trigger'],
    [schema.includes("case when NEW.status = 'active' then 'follow' else 'follow_request' end"), 'follow vs follow_request notification types'],
  ]);

  check('Tier 10.3: schema v2 calls table + trigger + realtime publication', [
    [schema.includes('create table if not exists public.calls'), 'calls table missing'],
    [schema.includes('using (caller = public.my_username() or callee = public.my_username())'), 'call rows visible to both parties only'],
    [schema.includes('trg_calls_notify'), 'incoming calls must notify the callee'],
    [/array\['notifications', 'calls', 'follows'\]/.test(schema), 'non-story tables join the realtime publication'],
    [!schema.includes("'story_views'") && !schema.includes("'stories'"), 'story tables must not join the publication'],
  ]);

  /* ---------------- 10.4 stories client runtime ---------------- */

  check('Tier 10.4: EXCLUSION — stories client layer must not exist', [
    [!exists('src', 'utils', 'stories.ts'), 'src/utils/stories.ts must be deleted'],
    [!exists('src', 'components', 'stories', 'StoriesRail.tsx'), 'StoriesRail must be deleted'],
    [!exists('src', 'components', 'stories', 'StoryViewer.tsx'), 'StoryViewer must be deleted'],
    [!exists('src', 'components', 'stories', 'CreateStory.tsx'), 'CreateStory must be deleted'],
    [!read('src', 'components', 'layout', 'ChatApp.tsx').includes('StoriesRail'), 'shell must not render a story tray'],
    [!read('src', 'components', 'layout', 'ChatApp.tsx').includes('StoryViewer'), 'shell must not mount a story viewer'],
    [!read('src', 'components', 'layout', 'ChatApp.tsx').includes('CreateStory'), 'shell must not mount the story composer'],
    [!read('src', 'utils', 'notifications.ts').includes('story'), 'notification feed must not carry story events'],
  ]);

  try {
    const notif: any = await import(pathToFileURL(path.join(projectRoot, 'src', 'utils', 'notifications.ts')).href);
    const allowed = notif.prefsAllow(notif.getNotifPrefs(), 'follow');
    const blockedPref = notif.prefsAllow({ ...notif.DEFAULT_NOTIF_PREFS, follows: false }, 'follow');
    const text = notif.notificationText({ id: 'x', username: 'a', actor: 'bob', type: 'follow_request', payload: {}, read_at: null, created_at: new Date().toISOString() });
    const age = notif.notificationAge(new Date(Date.now() - 5 * 60000).toISOString());
    check('Tier 10.4: notification prefs + labels (runtime)', [
      [allowed === true, 'default prefs allow follow activity'],
      [blockedPref === false, 'follows:false must gate follow events'],
      [text === 'requested to follow you', 'notificationText renders plain language'],
      [age === '5m', 'notificationAge is compact'],
    ]);
  } catch (err: any) {
    push('Tier 10.4: notification prefs + labels (runtime)', false, String(err?.message || err));
  }

  /* ---------------- 10.5 story UI ---------------- */

  check('Tier 10.5: profile page renders story-free (avatar, lists, block, remove-follower only)', [
    [read('src', 'components', 'profile', 'UserProfilePage.tsx').includes('data-testid="user-profile"'), 'profile page intact'],
    [!read('src', 'components', 'profile', 'UserProfilePage.tsx').includes('fetchUserStories'), 'profile must not load stories'],
    [!read('src', 'components', 'profile', 'UserProfilePage.tsx').includes('fetchHighlights'), 'profile must not load highlights'],
    [!read('src', 'components', 'profile', 'UserProfilePage.tsx').includes('toggleCloseFriend'), 'profile must not manage close friends'],
    [!read('src', 'components', 'layout', 'ChatApp.tsx').includes("go('/create')"), 'no navigation entry may target the story composer'],
  ]);

  /* ---------------- 10.6 notifications UI + prefs ---------------- */

  const notifUtil = read('src', 'utils', 'notifications.ts');

  check('Tier 10.6: notification preferences actually gate delivery', [
    [notifUtil.includes("const PREFS_KEY = 'axon_notif_prefs'"), 'prefs must persist'],
    [notifUtil.includes('export const prefsAllow'), 'prefsAllow must exist'],
    [notifUtil.includes("if (type === 'follow' || type === 'follow_request' || type === 'follow_accept') return prefs.follows;"), 'follow group pref wired'],
    [notifUtil.includes("if (type === 'message_request') return prefs.messages;"), 'message pref wired'],
    [read('src', 'components', 'settings', 'SettingsPanel.tsx').includes("toggleNotifPref('follows')"), 'settings must expose the group toggles'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes('fetchUnreadCount'), 'shell must show an unread badge'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes("table: 'notifications'"), 'badge must refresh over realtime'],
  ]);

  check('Tier 10.6: notifications panel lists, marks read, manages requests', [
    [exists('src', 'components', 'notifications', 'NotificationsPanel.tsx'), 'NotificationsPanel missing'],
    [read('src', 'components', 'notifications', 'NotificationsPanel.tsx').includes('markAllNotificationsRead'), 'mark all read'],
    [read('src', 'components', 'notifications', 'NotificationsPanel.tsx').includes('acceptFollowRequest') && read('src', 'components', 'notifications', 'NotificationsPanel.tsx').includes('declineFollowRequest'), 'inline follow-request management'],
    [read('src', 'components', 'notifications', 'NotificationsPanel.tsx').includes('deleteNotification'), 'per-item removal'],
  ]);

  /* ---------------- 10.7 profiles + search ---------------- */

  check('Tier 10.7: full profile page — avatar upload, edit, lists, block, close friends', [
    [exists('src', 'components', 'profile', 'UserProfilePage.tsx'), 'UserProfilePage missing'],
    [read('src', 'components', 'profile', 'UserProfilePage.tsx').includes('uploadAvatar') && read('src', 'components', 'profile', 'UserProfilePage.tsx').includes('removeAvatar'), 'profile photo upload + removal'],
    [read('src', 'components', 'profile', 'UserProfilePage.tsx').includes('updateAccountProfile'), 'edit profile must persist'],
    [read('src', 'components', 'profile', 'UserProfilePage.tsx').includes('removeFollower'), 'follower removal'],
    [read('src', 'components', 'profile', 'UserProfilePage.tsx').includes('This account is private'), 'private-account lock screen'],
    [read('src', 'utils', 'auth.ts').includes('fileToAvatarBlob'), 'avatars must be client-downscaled before upload'],
  ]);

  check('Tier 10.7: explore/search — recent searches, suggestions, block filtering', [
    [exists('src', 'components', 'search', 'ExplorePanel.tsx'), 'ExplorePanel missing'],
    [read('src', 'components', 'search', 'ExplorePanel.tsx').includes("RECENT_KEY = 'axon_recent_searches'"), 'recent searches persist'],
    [read('src', 'components', 'search', 'ExplorePanel.tsx').includes('isBlockedEitherWay'), 'blocked accounts must be filtered from results'],
    [read('src', 'components', 'search', 'ExplorePanel.tsx').includes('fetchFollowing'), 'suggestions come from people you follow'],
  ]);

  /* ---------------- 10.8 account lifecycle ---------------- */

  check('Tier 10.8: settings gains real account lifecycle controls', [
    [read('src', 'components', 'settings', 'SettingsPanel.tsx').includes('supabase.auth.updateUser({ password: newPassword })'), 'password change must go through Supabase Auth'],
    [read('src', 'components', 'settings', 'SettingsPanel.tsx').includes("signOut({ scope: 'global' })"), 'logout-everywhere must revoke all sessions'],
    [read('src', 'components', 'settings', 'SettingsPanel.tsx').includes('handleExportAccountData'), 'account data export'],
    [read('src', 'components', 'settings', 'SettingsPanel.tsx').includes('handleDeleteAccount'), 'account deletion flow'],
    [read('src', 'components', 'settings', 'SettingsPanel.tsx').includes("bio: 'This account has been deleted.'"), 'deletion must anonymize the profile'],
    [!read('src', 'components', 'settings', 'SettingsPanel.tsx').includes(".from('stories')"), 'deletion must not reference the removed stories table'],
    [!read('src', 'components', 'settings', 'SettingsPanel.tsx').includes("toggleNotifPref('stories')"), 'settings must not expose a story pref'],
  ]);

  /* ---------------- 10.9 engine hardening ---------------- */

  check('Tier 10.9: message engine accepts a target-chat override (deterministic sends)', [
    [read('src', 'contexts', 'CryptoContext.tsx').includes('chatOverride?: Chat'), 'sendMessage must accept a target chat'],
    [read('src', 'contexts', 'CryptoContext.tsx').includes('const targetChat = chatOverride || activeChat;'), 'override must take precedence over the active chat'],
    [read('src', 'components', 'chat', 'ConversationPanel.tsx').includes('onOpenProfile'), 'chat header must deep-link to profiles'],
  ]);

  return results;
}

export default runTier10Tests;

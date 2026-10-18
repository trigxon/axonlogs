import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

/**
 * Tier 10: Full Instagram-clone expansion — stories, notifications,
 * routed shell, profiles, search, account lifecycle. Structural +
 * runtime contracts, same style as tiers 7-9.
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

  check('Tier 10.1: ChatApp routes cover explore / notifications / create / profile / settings / 404', [
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes("p.startsWith('/explore')"), 'missing /explore route'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes("p.startsWith('/notifications')"), 'missing /notifications route'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes("p.startsWith('/create')"), 'missing /create route'],
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


  check('Tier 10.2: schema v2 stories table + server-enforced expiry + audience RLS', [
    [schema.includes('create table if not exists public.stories'), 'stories table missing'],
    [schema.includes("default (now() + interval '24 hours')"), 'stories must default to a 24h server-side expiry'],
    [schema.includes('can_view_story(username, audience, public.my_username())'), 'stories SELECT must go through can_view_story'],
    [schema.includes('expires_at > now()'), 'expired stories must be filtered server-side (RLS), not by client timers'],
    [schema.includes("username = public.my_username()"), 'story writes must be identity-scoped'],
  ]);

  check('Tier 10.2: schema v2 can_view_story enforces close friends + blocks', [
    [schema.includes("p_audience = 'close_friends' and public.is_close_friend(p_owner, p_viewer)"), 'close-friends audience must check the close_friends table'],
    [schema.includes('not public.is_blocked_either_way(p_owner, p_viewer)'), 'blocked users must never see stories'],
    [schema.includes('public.is_following(p_viewer, p_owner)'), 'followers audience must check the social graph'],
  ]);

  check('Tier 10.2: schema v2 story views + highlights + close friends tables', [
    [schema.includes('create table if not exists public.story_views'), 'story_views table missing'],
    [schema.includes('constraint story_views_pair unique (story_id, viewer)'), 'one view row per viewer per story'],
    [schema.includes('create table if not exists public.highlights'), 'highlights table missing'],
    [schema.includes('create table if not exists public.highlight_stories'), 'highlight_stories table missing'],
    [schema.includes('create table if not exists public.close_friends'), 'close_friends table missing'],
    [schema.includes("exists (\n        select 1 from public.highlight_stories hs"), 'expired stories must stay readable inside highlights'],
  ]);

  check('Tier 10.2: schema v2 private story_media bucket + avatar bucket', [
    [schema.includes("values ('story_media', 'story_media', false)"), 'story_media bucket must be PRIVATE'],
    [schema.includes("values ('avatars', 'avatars', true)"), 'avatars bucket missing'],
    [schema.includes("public.can_view_story(\n      (storage.foldername(name))[1]"), 'story_media read policy must derive visibility from the path'],
    [schema.includes("(storage.foldername(name))[1] = public.my_username()"), 'story_media/avatar writes must be owner-scoped by path'],
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
    [/array\['stories', 'story_views', 'notifications', 'calls'/.test(schema), 'new tables must join the realtime publication'],
  ]);

  /* ---------------- 10.4 stories client runtime ---------------- */

  try {
    const stories: any = await import(pathToFileURL(path.join(projectRoot, 'src', 'utils', 'stories.ts')).href);
    const fakeFile = (type: string, size: number) => ({ type, size }) as any;
    const badType = stories.validateStoryFile(fakeFile('application/pdf', 100));
    const tooBig = stories.validateStoryFile(fakeFile('image/jpeg', stories.MAX_STORY_BYTES + 1));
    const good = stories.validateStoryFile(fakeFile('image/jpeg', 1024));
    const goodVideo = stories.validateStoryFile(fakeFile('video/mp4', 1024));
    const expired = stories.isStoryExpired({ expires_at: new Date(Date.now() - 1000).toISOString() });
    const fresh = stories.isStoryExpired({ expires_at: new Date(Date.now() + 3600000).toISOString() });
    const ageRecent = stories.storyAgeLabel(new Date(Date.now() - 30 * 60000).toISOString());
    check('Tier 10.4: story validation + expiry helpers (runtime)', [
      [typeof badType === 'string' && /isn't supported/.test(badType), 'PDF must be rejected as unsupported'],
      [typeof tooBig === 'string' && /too large/.test(tooBig), '>10MB must be rejected'],
      [good === null && goodVideo === null, 'JPG + MP4 must pass'],
      [expired === true && fresh === false, 'expiry helper must compare server timestamps'],
      [/^(\d+m ago|\d+h|1d\+)$/.test(ageRecent), 'age label renders a compact form'],
    ]);
  } catch (err: any) {
    push('Tier 10.4: story validation + expiry helpers (runtime)', false, String(err?.message || err));
  }

  check('Tier 10.4: stories service layer guards inputs', [
    [read('src', 'utils', 'stories.ts').includes('MAX_STORY_BYTES = 10 * 1024 * 1024'), '10MB story ceiling'],
    [read('src', 'utils', 'stories.ts').includes('ALLOWED_STORY_TYPES'), 'explicit story type allowlist'],
    [read('src', 'utils', 'stories.ts').includes("story_media/${u}/${audience}/"), 'upload path must embed owner + audience for the storage policy'],
    [read('src', 'utils', 'stories.ts').includes('createSignedUrl'), 'private story media must be read through signed URLs'],
    [read('src', 'utils', 'stories.ts').includes("onConflict: 'story_id,viewer'"), 'story views upsert one row per viewer'],
  ]);

  try {
    const notif: any = await import(pathToFileURL(path.join(projectRoot, 'src', 'utils', 'notifications.ts')).href);
    const allowed = notif.prefsAllow(notif.getNotifPrefs(), 'story_reaction');
    const blockedPref = notif.prefsAllow({ ...notif.DEFAULT_NOTIF_PREFS, stories: false }, 'story_reaction');
    const text = notif.notificationText({ id: 'x', username: 'a', actor: 'bob', type: 'follow_request', payload: {}, read_at: null, created_at: new Date().toISOString() });
    const age = notif.notificationAge(new Date(Date.now() - 5 * 60000).toISOString());
    check('Tier 10.4: notification prefs + labels (runtime)', [
      [allowed === true, 'default prefs allow story activity'],
      [blockedPref === false, 'stories:false must gate story_reaction'],
      [text === 'requested to follow you', 'notificationText renders plain language'],
      [age === '5m', 'notificationAge is compact'],
    ]);
  } catch (err: any) {
    push('Tier 10.4: notification prefs + labels (runtime)', false, String(err?.message || err));
  }

  /* ---------------- 10.5 story UI ---------------- */

  check('Tier 10.5: story tray + viewer + composer components exist and wire RLS-backed data', [
    [exists('src', 'components', 'stories', 'StoriesRail.tsx'), 'StoriesRail missing'],
    [exists('src', 'components', 'stories', 'StoryViewer.tsx'), 'StoryViewer missing'],
    [exists('src', 'components', 'stories', 'CreateStory.tsx'), 'CreateStory missing'],
    [read('src', 'components', 'stories', 'StoriesRail.tsx').includes('fetchStoryTray'), 'tray must load through the stories service'],
    [read('src', 'components', 'stories', 'StoryViewer.tsx').includes('markStoryViewed'), 'viewer must record views server-side'],
    [read('src', 'components', 'stories', 'StoryViewer.tsx').includes('fetchStoryViewers'), 'owner must see who watched'],
    [read('src', 'components', 'stories', 'CreateStory.tsx').includes("'close_friends'"), 'composer must offer the Close Friends audience'],
    [read('src', 'components', 'layout', 'ChatApp.tsx').includes('handleStoryReply'), 'story replies must send a real DM'],
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
    [read('src', 'components', 'profile', 'UserProfilePage.tsx').includes('toggleCloseFriend'), 'close-friends management'],
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
  ]);

  /* ---------------- 10.9 engine hardening ---------------- */

  check('Tier 10.9: message engine accepts a chat override for story replies', [
    [read('src', 'contexts', 'CryptoContext.tsx').includes('chatOverride?: Chat'), 'sendMessage must accept a target chat'],
    [read('src', 'contexts', 'CryptoContext.tsx').includes('const targetChat = chatOverride || activeChat;'), 'override must take precedence over the active chat'],
    [read('src', 'components', 'chat', 'ConversationPanel.tsx').includes('onOpenProfile'), 'chat header must deep-link to profiles'],
  ]);

  return results;
}

export default runTier10Tests;

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

/**
 * Tier 8: Instagram feature parity (minus reels/stories/feed)
 * - Social graph: follow/unfollow, followers/following, follow requests, blocks
 * - Group DMs, message requests tab
 * - Reactions with full emoji picker, unsend for everyone, forward
 * - Chat themes, nicknames, mute, shared media, activity status
 * - Privacy toggles: read receipts, activity, private account
 */
export async function runTier8Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...parts: string[]) =>
    fs.readFileSync(path.join(projectRoot, ...parts), 'utf-8');

  // 8.1: Social graph + blocks + activity (utils + schema)
  const socialStart = Date.now();
  try {
    const authUtil = read('src', 'utils', 'auth.ts');
    const schema = read('supabase', 'schema.sql');
    const profile = read('src', 'components', 'profile', 'ProfilePanel.tsx');

    const checks: Array<[boolean, string]> = [
      [authUtil.includes('export const followUser') && authUtil.includes('export const unfollowUser'), 'auth.ts must implement follow/unfollow'],
      [authUtil.includes('fetchFollowState') && authUtil.includes('fetchFollowers') && authUtil.includes('fetchFollowing'), 'auth.ts must expose follow state + list fetchers'],
      [authUtil.includes("status = targetIsPrivate ? 'pending' : 'active'"), 'private accounts must receive pending follow requests'],
      [authUtil.includes('fetchFollowRequests') && authUtil.includes('acceptFollowRequest') && authUtil.includes('declineFollowRequest'), 'auth.ts must support the follow-request flow'],
      [authUtil.includes('export const blockUser') && authUtil.includes('unblockUser') && authUtil.includes('isBlockedEitherWay'), 'auth.ts must implement blocking (both-way enforcement)'],
      [authUtil.includes('activityLabel'), 'auth.ts must derive Instagram-style activity labels'],
      [schema.includes('create table if not exists public.follows'), 'schema.sql must create the follows table'],
      [schema.includes("'pending'"), 'schema.sql must support pending follow status'],
      [schema.includes("column_name = 'reactions'") && schema.includes("column_name = 'unsent'"), 'schema.sql must add reactions + unsent message columns'],
      [schema.includes("column_name = 'display_name'") && schema.includes("column_name = 'blocked_usernames'") && schema.includes("column_name = 'is_private'"), 'schema.sql must add display_name/blocked_usernames/is_private account columns'],
      [profile.includes("label=\"followers\"") || profile.includes("label='followers'") || profile.includes('{followers.length}'), 'Profile must show follower counts'],
      [profile.includes('Follow requests'), 'Profile must surface follow requests'],
      [profile.includes('Blocked accounts'), 'Profile must surface the blocked list'],
      [profile.includes('display_name'), 'Profile must support an Instagram display name'],
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
    if (failed.length > 0) throw new Error(failed.join('; '));

    results.push({
      name: 'Tier 8.1: Social graph (follows/blocks/requests/activity)',
      tier: 8,
      passed: true,
      durationMs: Date.now() - socialStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 8.1: Social graph (follows/blocks/requests/activity)',
      tier: 8,
      passed: false,
      error: err.message,
      durationMs: Date.now() - socialStart,
    });
  }

  // 8.2: Groups + message requests + inbox tabs
  const groupsStart = Date.now();
  try {
    const ctx = read('src', 'contexts', 'CryptoContext.tsx');
    const inbox = read('src', 'components', 'chat', 'InboxPanel.tsx');
    const chatApp = read('src', 'components', 'layout', 'ChatApp.tsx');
    const chatMeta = read('src', 'utils', 'chatMeta.ts');

    const checks: Array<[boolean, string]> = [
      [ctx.includes('createGroupChat'), 'CryptoContext must expose createGroupChat'],
      [ctx.includes('sendDmInvite'), 'Group members must be invited via dm_invites (auto-join delivery)'],
      [chatMeta.includes('markRequestAccepted') && chatMeta.includes('readAcceptedRequests'), 'chatMeta must track accepted message requests'],
      [chatMeta.includes('dmPeer') && chatMeta.includes('isGroupChat'), 'chatMeta must resolve DM peers vs groups'],
      [inbox.includes("'primary'") && inbox.includes("'requests'"), 'Inbox must have Primary/Requests tabs'],
      [inbox.includes('Accept') && inbox.includes('Delete'), 'Request rows must offer Accept/Delete'],
      [inbox.includes('Follow') && inbox.includes('Following') && inbox.includes('Requested'), 'Account rows must show Follow/Following/Requested buttons'],
      [chatApp.includes('showGroupModal') && chatApp.includes('New group'), 'ChatApp must provide the new-group modal'],
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
    if (failed.length > 0) throw new Error(failed.join('; '));

    results.push({
      name: 'Tier 8.2: Group DMs + message requests + follow UI',
      tier: 8,
      passed: true,
      durationMs: Date.now() - groupsStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 8.2: Group DMs + message requests + follow UI',
      tier: 8,
      passed: false,
      error: err.message,
      durationMs: Date.now() - groupsStart,
    });
  }

  // 8.3: Reactions/emoji, unsend, forward, themes, nicknames, mute, media
  const dmStart = Date.now();
  try {
    const convo = read('src', 'components', 'chat', 'ConversationPanel.tsx');
    const ctx = read('src', 'contexts', 'CryptoContext.tsx');
    const chatMeta = read('src', 'utils', 'chatMeta.ts');
    const chatApp = read('src', 'components', 'layout', 'ChatApp.tsx');
    const settingsPanel = read('src', 'components', 'settings', 'SettingsPanel.tsx');

    // runtime checks on pure helpers
    const meta: any = await import('../src/utils/chatMeta.ts');
    const authMod: any = await import('../src/utils/auth.ts');

    const checks: Array<[boolean, string]> = [
      [convo.includes('EmojiPicker'), 'ConversationPanel must include the full emoji picker for reactions'],
      [convo.includes('Message unsent'), 'Unsent messages must render the Instagram tombstone'],
      [ctx.includes('unsendMessage'), 'CryptoContext must expose unsendMessage (clear for everyone)'],
      [convo.includes('Forward to…'), 'ConversationPanel must offer the forward flow'],
      [ctx.includes('forwardMessage'), 'CryptoContext must expose forwardMessage'],
      [chatMeta.includes('CHAT_THEMES') && convo.includes('Chat theme'), 'Chat themes must exist and be pickable in the conversation menu'],
      [chatMeta.includes('getNickname') && convo.includes('Nickname'), 'Nicknames must be settable per chat'],
      [chatMeta.includes('setChatMuted') && convo.includes('Mute notifications'), 'Per-chat mute must exist in the conversation menu'],
      [convo.includes('Shared media'), 'ConversationPanel must offer the shared-media gallery'],
      [convo.includes('activityLabel'), 'DM header must show Instagram activity status'],
      [chatApp.includes('isChatMuted'), 'Incoming alerts must respect per-chat mute'],
      [settingsPanel.includes('Read Receipts') && settingsPanel.includes('Activity Status') && settingsPanel.includes('Private Account'), 'Settings must offer Instagram privacy toggles'],
      [ctx.includes('readReceipts'), 'Read receipts must be a setting the engine honors'],
      [meta.dmPeer('@a·@b', 'a') === 'b', 'dmPeer must resolve the other handle'],
      [meta.isGroupChat('the squad') === true && meta.isGroupChat('@a·@b') === false, 'isGroupChat must separate named groups from DM channels'],
      [typeof authMod.activityLabel({ last_seen_at: new Date().toISOString(), show_activity: true }) === 'string' && authMod.activityLabel({ last_seen_at: new Date().toISOString(), show_activity: true }).includes('Active'), 'activityLabel must produce "Active now" for fresh presence'],
      [authMod.activityLabel({ last_seen_at: new Date().toISOString(), show_activity: false }) === null, 'activityLabel must hide status when show_activity is false'],
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
    if (failed.length > 0) throw new Error(failed.join('; '));

    results.push({
      name: 'Tier 8.3: Reactions/unsend/forward/themes/nicknames/mute/media/privacy',
      tier: 8,
      passed: true,
      durationMs: Date.now() - dmStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 8.3: Reactions/unsend/forward/themes/nicknames/mute/media/privacy',
      tier: 8,
      passed: false,
      error: err.message,
      durationMs: Date.now() - dmStart,
    });
  }

  return results;
}

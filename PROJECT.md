# Project: Axon Logs — Instagram-Style Chat-Only Transformation

## Architecture
- Tech Stack: React 19, Vite 8, TypeScript 6, Tailwind CSS 4, Lucide React, Framer Motion, Supabase Realtime, Crypto-JS.
- State Management: Custom React Context (`CryptoContext`, `ThemeContext`). Chat engine unchanged: local sandbox (localStorage) + online (Supabase broadcast/presence).
- Product Pivot (R0 — this milestone): the terminal workspace was rebuilt into an **Instagram-style, chat-only messenger** while preserving the full cyber theme (void bg, neon cyan/emerald, JetBrains Mono, CRT scanlines/glows). **Removed distractions:** Axon AI shell, Logs view, terminal tab strip, command-bar-first composer, markdown rendering in bubbles.
- Layout Architecture:
  - `ChatApp.tsx` shell:
    - Desktop (md+): Instagram-web 3-column layout — thin icon rail (Chats / New message / Join code / Profile avatar / Settings) + inbox panel (340–380px) + right pane (conversation | profile | settings).
    - Mobile: single-column view stack `inbox → chat → profile → settings` with back navigation.
  - `InboxPanel.tsx`: alias header + join/new actions, search, story-ring "Your note" ACTIVE strip, chat rows (avatar, name, preview, time, unread dot, typing).
  - `ConversationPanel.tsx`: header (back, avatar, name, status line, search strip, voice/video call, ⋮ options menu), Instagram bubbles (theirs left with avatar / mine cyan-emerald gradient), message grouping, day dividers, double-tap ❤️ burst + heart badge, quick-reaction bar, replies, pins (context menu), burn indicator, Seen receipts, typing bubble, jump-to-latest chip, pill composer (attach · input · burn toggle · voice · send).
  - `ProfilePanel.tsx`: big story-ring avatar + gradient picker, alias editing, bio note, stats (chats / sent / active), quick toggles (stealth, burn-on-read, burn timer, attachments, voice), security & data (settings, panic, terminate).
  - `Avatar.tsx`: deterministic gradient by id seed, initials, presence dot, story/seen/locked ring modes.
  - `chatMeta.ts`: avatar gradients, last-message previews (local + Supabase hydration, persisted cache), unread tracking via `axon_chat_reads`, bio/avatar helpers.
  - Modals: New message (create), Join code, Rename, Key rotation, Unlock (brute-force lockout + decoy diversion + keystroke dynamics preserved).

## Feature Inventory (this pivot)
| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 1 | DM Inbox (R1) | Story rings, search, previews, unread, typing in rows, recency sort | DONE |
| 2 | DM Conversation (R2) | IG bubbles, double-tap heart, reactions, replies, seen, typing bubble | DONE |
| 3 | Profile (R3) | Avatar picker, alias, bio, stats, quick controls, security actions | DONE |
| 4 | New Message / Join flows (R4) | IG-style modals, generated AXON-XXXX key, ephemeral toggle | DONE |
| 5 | Distraction removal (R5) | Axon AI, Logs, tab strip, slash-command noise, steg UI removed | DONE |
| 6 | Theme preservation (R6) | All index.css tokens/utilities kept; new bubble/heart/story styles added in-palette | DONE |
| 7 | Calls (kept) | Voice/video buttons in conversation header; CallOverlay + IncomingCallScreen unchanged | DONE |
| 8 | Tests updated | Tier 1/5/6 re-targeted to new files; suite green (15/15) | DONE |

## Interface Contracts
### `CryptoContext` (additions only)
- `myGradient: string` + `updateMyGradient(g)` — own avatar gradient (localStorage `axon_avatar_gradient`).
- `sendMessage(text, file?, replyToId?, burnOverride?)` — 4th param overrides the global burn-on-read setting for that message.

### `chatMeta.ts`
- `hydratePreviews(chats, mode, supabase)` → `Record<chatId, ChatPreview>` (decrypts latest message per chat; local mode reads `axon_messages`, online mode queries `messages` limit 1).
- `isUnread(chatId, preview, selfId)` via `axon_chat_reads` timestamps; `markChatReadUpToNow(chatId)` called by ConversationPanel while the feed is visible.

### Removed interfaces
- `ActiveView` ('dashboard' | 'axon-ai' | 'settings' | 'logs'), `Sidebar.tsx`, `TerminalUI.tsx`, `AxonAIShell.tsx`, `LogsView.tsx`, `JoinScreen.tsx` (was dead code).

## Notes
- Previews for chats never opened on this device read "End-to-end encrypted" (honest + privacy-first).
- SIM demo node moved to Settings → Global Cloud Sync (local mode only).
- `react-markdown`/`remark-gfm`/`emoji-picker-react` are no longer referenced by the UI (kept in package.json; tree-shaken from bundle).
- Legacy `tests/challenger_2_empirical_verification.ts` predates the pivot and is not part of `npm test`.

## Milestone R1 — Accounts + Mac Chrome Restore

- **Accounts (username + password):** new `AuthScreen` gates the app (`App.tsx` renders `AuthScreen` when no session). `src/utils/auth.ts` implements PBKDF2-SHA256 hashing (60k iterations, 128-bit salt, `pbkdf2$iter$salt$hash` format), Instagram-style username validation (1–30 chars, `[a-z0-9._]`, no leading/trailing period, live availability check while typing), **no password restrictions by design** (any password is accepted), signup/login/search/profile-update against the new Supabase `accounts` table (server-side `accounts_username_format` CHECK mirrors the client rules), and localStorage session persistence (`axon_session`).
- **DM delivery (Instagram "Message @user"):** `CryptoContext.startDmWithUser(username)` creates an encrypted channel (`@a·@b` sorted name, `DM-XXXXXXXX` passphrase) and writes a row to the new `dm_invites` table. Recipients auto-join via realtime INSERT subscription + login backfill (`fetchMyDmInvites`), keyring the channel, and auto-unlock — no passphrase prompt. Inbox display names resolve DM channels to the OTHER handle via `dmDisplayName`.
- **Inbox privacy:** chat list is filtered to the device keyring ∪ known chats (`isKnownChatId`), so the global channel directory is no longer dumped into the inbox; people search (accounts) surfaces in the same search box with a Message action.
- **Story strip removed:** the "Your note" stories-position row is gone (no reels / no stories / no posts policy).
- **Mac window chrome restored:** `ChatApp` + `AuthScreen` render inside the original `term-window` with traffic-light `term-titlebar` (@handle + live clock) and tmux-style `term-statusbar` (GLOBAL SYNC / TERM / typing / USR / LAT / TERMS / NODE / clock) using the untouched index.css theme.
- **Schema:** `supabase/schema.sql` adds `accounts` + `dm_invites` (public policies, indexes, realtime publication) — idempotent, must be re-run once in the Supabase SQL editor.
- **Tests:** new Tier 7 (auth gate + PBKDF2, DM flow contract, story-free inbox + Mac chrome) — suite 18/18 PASS.

## Milestone R2 — Full Instagram Parity (minus reels/stories/feed)

- **Social graph:** `follows` table (follower/followed/status active|pending), `followUser`/`unfollowUser`/`fetchFollowState`/`fetchFollowers`/`fetchFollowing` in `auth.ts`. Follow/Following/Requested buttons on account rows; followers/following counts + list modals on Profile; follow requests (private accounts) with Accept/Decline.
- **Blocking:** `accounts.blocked_usernames[]` + `blockUser`/`unblockUser`/`isBlockedEitherWay`; DM creation refuses blocked pairs; conversation composer swaps to an Unblock bar; blocked accounts hidden from search; Unblock lives in Profile → Blocked accounts.
- **Group DMs:** `createGroupChat(name, members)` inserts a named encrypted channel + one `dm_invites` row per member (existing auto-join delivers). New-group modal (name + member chips + search). GROUP badge in inbox, member count in header, Leave group (archive).
- **Message requests:** Primary/Requests tabs; a DM whose peer I don't follow (and never accepted) files under Requests with Accept/Delete (`axon_accepted_requests`).
- **Reactions sync:** `messages.reactions` jsonb column; toggleReaction persists online and propagates via realtime UPDATE; full emoji picker (`emoji-picker-react`) behind the "+" in the quick bar.
- **Unsend / Forward:** `messages.unsent` tombstone column + `unsendMessage` (clears text/file/reactions for everyone); `forwardMessage` re-encrypts content into the target channel; Forward modal lists known chats.
- **Per-chat options:** 6 chat themes (`axon_chat_themes`), nicknames (`axon_chat_nicknames`), mute (`axon_chat_muted` — silences ping + desktop alerts), shared-media gallery modal.
- **Presence & privacy:** `last_seen_at` heartbeat (4 min) + `activityLabel` ("Active now / Xm ago"); Settings toggles Read receipts / Activity status / Private account; `accounts.display_name` editable on Profile; private-account + activity flags sync to the cloud profile.
- **Schema (idempotent):** `follows` table, `messages.reactions/pinned/edited/unsent` columns, `accounts.display_name/is_private/blocked_usernames/show_activity` columns. USER MUST RE-RUN supabase/schema.sql once in the Supabase SQL editor.
- **Tests:** tier8 (social graph, groups/requests, reactions/unsend/forward/themes/nicknames/mute/media + runtime helper checks) — suite 22/22 PASS; build PASS; headless smoke 16/16.

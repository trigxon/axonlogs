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

# Axon Logs — Engineering Audit (Phase A)

Date: 2026-10-18 · HEAD: `dd97cf9` · Build: PASS (tsc + vite, 1.09s) · Tests: 23/23 PASS
Scope: full-repo audit against the master engineering brief (Instagram-inspired, distraction-free, secure social communication).

---

## 1. Architecture assessment

**Stack (retained):** React 19 + TypeScript + Vite 8 + Tailwind v4; `@supabase/supabase-js` v2.112; crypto-js (AES + PBKDF2); WebRTC P2P calling over Supabase Realtime signaling; Vercel hosting at `axonlogs.vercel.app`.

**Module map (current, evidence-based):**

| Area | Files | State |
|---|---|---|
| Crypto engine (E2EE per-chat AES, burn-on-read, keyring) | `src/contexts/CryptoContext.tsx` (1,968 lines) | Working, but is a giant context: state + domain logic + DB access + realtime in one file. Split is Phase H tech-debt, not a blocker. |
| Accounts / identity | `src/utils/auth.ts`, `src/components/auth/AuthScreen.tsx` | Custom PBKDF2-SHA256 (60k iter) against `accounts.password_hash`. **No Supabase Auth — see Finding S1/S2.** |
| Social graph | `auth.ts` (follows/blocks) + `InboxPanel`/`ProfilePanel` | Working against `follows` table; DM-gated to follows since `dd97cf9`. |
| Messaging | `InboxPanel`, `ConversationPanel`, `chatMeta.ts` | DMs + groups, requests tab, reactions (persisted), pins, edits, unsend-for-everyone, forward, replies, read receipts, typing, mute, themes, nicknames, shared media, vanish mode. |
| Calls | `CallOverlay.tsx`, tier6 tests | Real WebRTC audio/video over Supabase signaling; **no TURN → fails on symmetric-NAT networks** (documented limitation). |
| Storage | `CryptoContext.tsx` upload path (~line 1280) | Public bucket `chat_files`, **unencrypted bytes** (Finding S4). |
| Tests | `tests/tier1..8` + `scripts/smoke-*.mjs` | 23/23 structural+runtime; headless smokes for auth, parity, follow-gate. |

**What is verified working (not assumed):** build, full test suite, prior production deployments (7142184690 success) and live-bundle marker checks recorded in `worklog.md`.

---

## 2. Security findings (ordered by severity)

Evidence = file + line references verified in this audit.

- **S1 · CRITICAL — Every RLS policy is `using (true)`.** `supabase/schema.sql` lines 146–157, 184–186, 196–214: `accounts`, `follows`, `dm_invites`, `chats`, `messages` are world-readable **and world-writable** by anyone holding the public anon key. Consequences: anyone can rewrite another user's profile or `password_hash` (account takeover via direct API call), read/edit/delete any message, forge follows. *Fix: Phase B (this release) — auth.uid()-scoped policies + ownership helpers.*
- **S2 · CRITICAL — Password hashes are publicly readable.** `accounts.password_hash` is exposed by the open SELECT policy (S1). PBKDF2 at 60k iterations is below current OWASP guidance and offline-crackable for weak passwords. *Fix: Phase B — hashes become unreadable the moment an account links to its Supabase Auth user (`legacy_login` view only exposes un-migrated rows); lockdown SQL ships with the migration.*
- **S3 · CRITICAL — The decryption key is stored next to the ciphertext.** `chats.share_code` doubles as the AES passphrase (by design, terminal heritage) and is readable by anyone (S1). Even with perfect RLS the server can decrypt everything; E2EE claims are therefore **not** currently accurate. *Fix path (Phase E): derive per-conversation keys on-device, deliver only wrapped key material via invites, stop persisting raw share codes. Documented honestly — NOT fixed in this release.*
- **S4 · HIGH — Attachments are unencrypted on a public bucket.** `CryptoContext.tsx` ~1280–1290: raw file upload → `getPublicUrl`. The message row stores the URL encrypted, but bucket objects are public. *Fix path (Phase E): encrypt bytes with the chat key before upload + signed-URL reads.*
- **S5 · MEDIUM — No rate limiting / abuse controls.** Signup, login (PBKDF2 oracle), search, and message sends are unthrottled. Partial mitigation after Phase B: auth attempts go through Supabase Auth (built-in rate limits).
- **S6 · MEDIUM — Client-trust model for message edits/deletes.** With participant-scoped UPDATE, any chat member can edit/unsend another member's row. Proper fix = separate `message_reads`/audit tables (roadmap Phase E). Current client UI already scopes edits to the sender.
- **S7 · LOW — Master-prompt deviations documented, not hidden:** custom auth retained as legacy fallback (Synthetic-email Supabase Auth is primary; full custom-auth retirement blocked on one Supabase dashboard toggle, see §4); TURN service not provisioned (owner cost decision); no service-role Edge Functions (deploy needs Supabase CLI token).

---

## 3. Feature parity matrix (Instagram → Axon Logs)

Legend: ✅ done & tested · 🟡 partial · ❌ planned (phase) · 🚫 deliberately excluded

| Domain | Features | State |
|---|---|---|
| Accounts | signup/login/logout, session persistence, IG username rules, zero password policy, live availability check | ✅ (auth upgrade = Phase B) |
| | email verification, password reset, session revocation, account deletion | ❌ Phase G |
| Profiles | avatar gradients, display name, bio, followers/following counts + lists, follow requests, blocked list | ✅ |
| Social graph | follow/unfollow, private accounts + pending requests, accept/decline, block, activity status | ✅ |
| | remove follower, restrict, close friends, data export (cloud) | ❌ Phase G |
| Messaging | 1:1 + group DMs, Primary/Requests tabs, media/voice/file attachments, replies, reactions+picker, pins, edit, unsend for everyone, forward, read receipts, typing, presence, mute, themes, nicknames, search, archive, vanish (burn) mode | ✅ |
| | pagination of history, delivery states (pending/sent/seen), idempotent retry + offline outbox | ✅ Phase D |
| | link previews, server-side delivered acks beyond read_by | 🟡 Phase E |
| E2EE | per-chat AES-256, burn-on-read, device keyring, brute-force lockout, decoy vault, panic wipe, idle lock | ✅ engine |
| | true key establishment/rotation/wrapping (S3), multi-device, independent review | ❌ Phase E |
| Calls | voice + video WebRTC, accept/decline/cancel, mute/camera toggles, incoming-call screen, history | ✅ engine |
| | TURN relay (S7), busy state, device selection | ❌ Phase F |
| Notifications | desktop notifications, in-app pings, DM-invite backfill | ✅ basic |
| | notification center/table, preferences, web push | ❌ Phase F |
| Stories | — | 🚫 excluded (product decision: distraction-free; master prompt deviation accepted) |
| Feed/Reels | — | 🚫 excluded by product charter |
| Safety | block/unblock, requests gating, vanish mode | ✅ |
| | reporting/moderation tables, rate limits (S5) | ❌ Phase G |
| Ops | Vercel HTTPS deploy, SPA fallback, env config, graceful schema degradation, smoke scripts | ✅ |
| | error monitoring, backups doc, TURN + push infra | ❌ Phase H |

---

## 4. Migration plan & execution order

**Phase B (THIS release) — Authentication & authorization baseline:**
1. Supabase Auth becomes the identity layer: `auth.signUp` / `auth.signInWithPassword` with deterministic synthetic emails `<username>@users.axonlogs.app` (username-only UX preserved). Existing PBKDF2 login retained as automatic legacy fallback + one-time migration link (`accounts.auth_uid`).
2. `supabase/schema.sql` v2: `auth_uid`, `chat_participants`, security-definer `my_username()`, `profiles` / `legacy_login` views, ownership-scoped RLS on every table, server-enforced follow gate for 2-person chat sends, private-profile storage policy direction. All idempotent; safe to re-run.
3. **Deployment order matters:** client first (this release works against both old and new schemas), then the owner re-runs `schema.sql` once in the Supabase SQL editor to lock the database down.
4. Owner prerequisite for Supabase Auth signup: Authentication → Providers → Email → **disable "Confirm email"** (no real mailbox exists behind synthetic emails). The client detects a confirmation-required project and falls back to legacy signup with a clear message instead of bricking.

**Later phases (prioritized):** D messaging hardening (pagination, delivery states) → E crypto truth (S3 key wrapping, encrypted attachments S4, message-read tables S6) → F calls infra (TURN) + notification center → G safety (reports, rate limits, account deletion, data export) → H ops (monitoring, CryptoContext decomposition, backups runbook).

---

## 5. Verification protocol & results for Phase B

**Protocol:** build + full tier suite before push; runtime smoke against the **live** Supabase project; structural security tests on the schema.

**Actual results (this release):**

| Check | Result |
|---|---|
| `npm run build` (tsc + vite) | PASS |
| Tier suite (tiers 1–9, incl. new Tier 9 security baseline) | **65/65 PASS** |
| Live smoke `scripts/smoke-auth-v2.mjs` — signup → app, password floor, reload persistence, logout, login round-trip | **7/7 PASS** |
| Production bundle + deployment verification | verified post-push (see worklog) |

**Findings from live verification:**
- The live Supabase project already has email confirmation disabled — synthetic-email signup returns a session immediately, so the owner prerequisite in §4.1 is already satisfied (no action needed).
- Supabase Auth's 6-character password floor is live and surfaced in plain language ("Choose a password with at least 6 characters."). The earlier "any password accepted" behavior survives only on legacy (pre-v2) databases. This supersedes the earlier zero-restriction contract and is documented as a deliberate deviation (master prompt: "Use Supabase Auth rather than treating a custom password-hash column as a complete authentication system").
- Legacy accounts (PBKDF2 rows) still log in with their existing passwords; on first login they are invisibly provisioned into Supabase Auth and their profile row is linked (`auth_uid`), after which their hash becomes unreadable through the `legacy_login` view.
- **Deployment order:** ship client first (works on both schema generations), then the owner runs `supabase/schema.sql` once to lock the database down. Until then the live DB keeps the legacy permissive policies (S1/S2 still open until that SQL runs).

---

## 6. Phase C–G expansion (stories · notifications · routed shell · profiles · search · account lifecycle)

Date: 2026-10-18 · HEAD: `d1fea86` · Build: PASS · Tests: **84/84 PASS** · Deploy: 7152959234 success

### 6.1 What shipped (verified, not assumed)

| Domain | Additions | Where |
|---|---|---|
| Shell | react-router (`BrowserRouter`): `/direct`, `/direct/t/:chatId`, `/explore`, `/notifications`, `/create`, `/profile(/:username)`, `/settings`, in-app 404; desktop rail (Chats/Search/Create/Notifications/New msg/Invite/Profile/Settings) + Instagram-style mobile bottom nav + realtime unread badge | `App.tsx`, `ChatApp.tsx` |
| Stories | `stories` / `story_views` / `highlights` / `highlight_stories` / `close_friends` tables; **server-enforced 24h expiry** (RLS filters `expires_at > now()`), audience RLS via `can_view_story(owner, audience, viewer)` (followers ∪ public-visitors, close-friends list, blocks excluded); private `story_media` bucket with path-derived storage policy (`story_media/{username}/{audience}/{file}`); public `avatars` bucket; tray, composer (photo/video ≤10MB, text overlays, caption, Followers/Close-friends audiences), viewer (segment progress, pause, tap zones, quick reactions → notification, DM replies via the real engine, owner viewer-list + delete), highlights (create from active stories, delete) | `supabase/schema.sql` §6, `src/utils/stories.ts`, `src/components/stories/*` |
| Notifications | `notifications` table (RLS: owner-only), DB triggers for follow / follow-request / follow-accepted / message-request / incoming-call; client-inserted story events stamped with the real actor; realtime badge (45s poll fallback); Activity panel with inline request accept/decline, mark-read (one/all), delete; per-group prefs (follows/messages/stories/calls) persisted locally and enforced via `prefsAllow` | schema §6.6–6.7, `src/utils/notifications.ts`, `NotificationsPanel.tsx` |
| Profiles | Full routed profile: avatar **upload (client-downscaled) / removal** through the avatars bucket, edit name/bio/gradient, stats → follower/following list modals, remove-follower, block/unblock, close-friends toggle, private-account lock screen, follow/request/message actions, active stories grid + highlights row, bio linkification; chat header deep-links to profiles | `UserProfilePage.tsx`, `auth.ts` avatar helpers |
| Search | `/explore`: username + display-name search, recent searches (device-local, clearable), "You follow" suggestions, block-filtered results, follow/Chat actions | `ExplorePanel.tsx` |
| Account lifecycle | Settings → Account: password change (`auth.updateUser`), log-out-everywhere (`signOut({scope:'global'})`), account-data export (JSON), delete-account flow (content wipe + anonymize + global sign-out; auth-user row removal documented as owner-dashboard action) | `SettingsPanel.tsx` |
| Engine | `sendMessage(text, file, replyToId, burnOverride, chatOverride)` — story replies land in the right DM deterministically | `CryptoContext.tsx` |

### 6.2 Finding S8 · CRITICAL — RLS self-recursion (FIXED in repo; needs one SQL re-run)

**Found by the live smoke, not by reading code.** The Phase-B `chat_participants` SELECT policy queried its own table (`exists (select 1 from chat_participants …)` inside its own USING clause). Postgres evaluates that recursively through RLS → `42P17 infinite recursion detected in policy for relation "chat_participants"` → every `chats`/`messages` read 500s → the client degrades to local mode. This shipped broken in Phase B because the pre-deployment smoke ran before the owner applied the SQL.

**Fix (this release):** all membership checks now go through SECURITY DEFINER helpers that bypass RLS on `chat_participants`:
`is_chat_member(chat, user)`, `chat_member_count(chat)`, `can_dm_chat(chat, user)` (keeps the server-enforced follow gate for 1:1 DMs). Tier 10.2 adds a structural regression guard: **no policy body may query its own table**.

### 6.3 Finding S9 · LOW — signup email rate limit UX (fixed)

Supabase Auth's `over_email_send_rate_limit` (per-IP signup quota) surfaced as a confusing legacy-path failure. Signup now detects it and shows "Too many accounts have been created from this network. Wait a few minutes and try again." in both the primary and legacy-migration paths.

### 6.4 E2EE posture (unchanged, honest)

Stories and notifications are plaintext-by-design (RLS-guarded) — matching Instagram's model. DM content stays per-chat AES with the S3 key-beside-ciphertext caveat documented above; the UI does not claim E2EE beyond what AUDIT §2-S3 substantiates.

### 6.5 Deployment state & the one remaining user action

- Production `axonlogs.vercel.app` serves this build (deploy 7152959234 success; live chunks verified: `index-CTQI6_7L.js` carries all shell/story/notification markers, lazy `SettingsPanel-C119Beph.js` carries the account-lifecycle strings).
- **VERIFIED 2026-10-19 (this session): the owner re-ran `schema.sql`** — REST probes with the anon key return 200 for `notifications` / `chat_participants` / `stories` (SECTION 5+6 tables exist) and **401 for `accounts`**, proving the S1/S2 lockdown is LIVE. No owner action remains for Phases B–C.
- TURN relay for calls remains unprovisioned (owner cost decision, documented in §3).

---

## 7. Phase D — messaging hardening (pagination · delivery states · idempotent retry · offline recovery)

Date: 2026-10-19 · HEAD: (this release) · Build: PASS (tsc + vite) · Tests: **92/92 PASS** (84 + 8 new Tier 11) · Schema harness: fresh-DB + idempotency + SECTION 7 artifacts verified on standalone PostgreSQL 18.6

### 7.1 What shipped

| Capability | Implementation | Where |
|---|---|---|
| Keyset-paginated history | `fetchMessages` loads only the newest page (30, `order created_at desc + limit`); `loadOlderMessages()` keyset-paginates with a `created_at` cursor (never OFFSET); cursor + `hasMoreMessages` reset on chat switch; read-receipt + burn semantics applied to older pages too; UI "Load earlier messages" control with scroll-height-delta compensation so the viewport stays anchored | `CryptoContext.tsx`, `ConversationPanel.tsx` |
| Delivery states | Optimistic row renders **pending** BEFORE the network hop; server ack flips to **sent**; any other device appending `read_by` yields **Seen** (existing last-message line now shows Sending…/Sent/Seen) | `CryptoContext.tsx`, `ConversationPanel.tsx` |
| Idempotent sends | Every insert carries a client-generated `client_tag` uuid; **unique partial index `(chat_id, client_tag) WHERE client_tag IS NOT NULL`** turns an already-landed retry into a `23505` conflict that is treated as idempotent success — a resend can never create a duplicate row | `supabase/schema.sql` §7, `CryptoContext.tsx` |
| REAL retry (fake removed) | The old `resendMessage` only printed a "⟳ Resent" system log — a decorative control (master-prompt violation). It is now an async re-insert under the SAME `client_tag`; `Failed · Tap to retry` renders under failed own messages | `CryptoContext.tsx`, `ConversationPanel.tsx` |
| Durable outbox | Failed sends queue in `localStorage['axon_outbox']` (ciphertext payload + stable tag, storage-injectable module); flushed on `online` event, on boot, and 4s after boot; `23505`→delivered, `42501`/network→keep queued, FK-class→drop; queue is deduped by tag so retry storms cannot pile up | `src/utils/outbox.ts`, `CryptoContext.tsx` |
| Offline recovery across reloads | On chat open, queued-but-undelivered payloads re-attach to the feed as failed rows; after flush they flip to sent live | `CryptoContext.tsx` |
| Both-schema-generation safety | `insertMessageSafe` detects `PGRST204`/`42703` (legacy DB without the new column) and retries the insert WITHOUT `client_tag` — sends keep working before the owner re-runs schema.sql; idempotency activates automatically afterwards | `CryptoContext.tsx` |

### 7.2 Verification actually run

- `npm run build` — PASS. `npm test` — **92/92** (new Tier 11: schema contract, pagination contracts, idempotent-send contract, fake-resend removal guard, outbox runtime behavior executed in Node with an injected storage stand-in, UI affordances, graceful-degradation contract).
- Standalone-PG harness (`scripts/validate-schema.sh` path): fresh-DB run + idempotent re-run both PASS; direct psql probes confirm `messages.client_tag` and `idx_messages_chat_client_tag` exist post-run.
- Live DB state verified via authenticated REST probes (see §6.5) — SECTION 5/6 live, lockdown active.

### 7.3 Owner action (optional, non-blocking)

Re-run `supabase/schema.sql` once more in the SQL editor to activate Phase D (`client_tag` + unique index). **Not urgent**: until then the client degrades gracefully (§7.1 last row) and every feature keeps working.

### 7.4 Remaining known gaps (unchanged)

TURN relay (S7/Phase F), link previews + delivered-vs-read server acks beyond `read_by` (Phase E), S3 key-wrapping / S4 encrypted attachments (Phase E), message-edit/audit tables (S6), reports/moderation tables (Phase G), web-push (Phase F).

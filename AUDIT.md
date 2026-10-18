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
| | pagination of history, delivery states, link previews, server-enforced follow gate for existing chats | 🟡 Phase D/E |
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

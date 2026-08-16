# Project: Axon Logs Platform Enhancement

## Architecture
- Tech Stack: React 19, Vite 8, TypeScript 6, Tailwind CSS 4, Lucide React, Framer Motion, MLC WebLLM.
- State Management: Custom React Context (`CryptoContext`, `ThemeContext` / `SettingsContext`). State-driven view navigation (`activeView: 'dashboard' | 'settings' | 'logs' | 'axon-ai'`).
- Layout Architecture:
  - Single collapsible `Sidebar.tsx` on the left merging navigation (CORE: Dashboard, Axon AI / SYSTEM: Settings, Logs), the TERMINALS list with local search, per-terminal action buttons (RENAME / KEY ROTATION / ARCHIVE / WIPE), JOIN LINK + CREATE TUNNEL + STEALTH MODE, the console identity box, and TERMINATE SESSION.
  - Dynamic `main` container displaying the active view component (`Dashboard/TerminalUI.tsx`, `AxonAIShell.tsx`, `SettingsPanel.tsx`, `LogsView.tsx`).
  - Dynamic root CSS variables (`--ui-text-size`, `--ui-card-padding`, `--ui-border-radius`) driven by `ThemeContext` / `SettingsContext`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Pre-existing Build Fixes | Fix unused TS variables and `sendMessage` call in `VoiceRecorder.tsx` & `TerminalUI.tsx` | M1 | Survey |
| 2 | Collapsible Sidebar Navigation (R1) | Collapsible sidebar with Dashboard, Settings, Logs, and Axon AI links | M2 | R1 |
| 3 | Axon AI Interface Shell (R2) | Premium UI view for Axon AI assistant with status header, suggestion cards, prompt feed, and input bar | M3 | R2 |
| 4 | Dynamic Settings System (R3) | UI Text Size (Small/Medium/Large), Card Padding (Compact/Normal/Relaxed), Border Radius (Sharp/Rounded/Pill) updating CSS variables/state | M4 | R3 |
| 5 | Full Data Management (R4) | Export JSON/PDF download, Import JSON upload, Danger Zone Reset all local data | M5 | R4 |
| 6 | E2E Integration & Verification | Final E2E testing, build check (`npm run build`), dynamic CSS check, download check, and Forensic Audit | M6 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Build Fixes & Core Context Setup | Resolve pre-existing TS build errors and create `ThemeContext` / `SettingsContext` | none | DONE |
| M2 | Collapsible Sidebar & View Navigation (R1) | Build `Sidebar.tsx`, `LogsView.tsx`, and state-driven view navigation in `App.tsx` | M1 | DONE |
| M3 | Axon AI Interface Shell (R2) | Build `AxonAIShell.tsx` component with premium UI visual shell | M2 | DONE |
| M4 | Dynamic Settings System (R3) | Build `SettingsPanel.tsx` with dynamic appearance controls (text size, padding, border radius) | M1, M2 | DONE |
| M5 | Full Data Management Export/Import (R4) | Create `dataManager.ts` and integrate JSON/PDF Export, JSON Import, and Danger Zone Reset in `SettingsPanel.tsx` | M4 | DONE |
| M6 | Final Integration & E2E Acceptance Pass | E2E test verification, clean build (`npm run build`), dynamic CSS verification, export download verification, and Forensic Audit | M1-M5 | DONE |

## Interface Contracts
### `SettingsContext` / `ThemeContext` ↔ UI Components
- State properties: `textSize: 'small' | 'medium' | 'large'`, `cardPadding: 'compact' | 'normal' | 'relaxed'`, `borderRadius: 'sharp' | 'rounded' | 'pill'`.
- Root CSS variables set on `:root`:
  - `--ui-text-size`: `12px` | `14px` | `16px`
  - `--ui-card-padding`: `8px` | `16px` | `24px`
  - `--ui-border-radius`: `0px` | `8px` | `24px`

### View Navigation Interface
- `activeView`: `'dashboard' | 'settings' | 'logs' | 'axon-ai'`
- `isSidebarCollapsed`: `boolean`

### Data Manager Interface (`src/utils/dataManager.ts`)
- `AxonExportPayload`: `{ version: string; exportedAt: string; identity: { alias: string; deviceId: string }; settings: AppSettings; knownChats: string[]; chats: Chat[]; messages: Message[]; systemLogs: SystemLog[] }`
- `downloadJsonExport(payload)`
- `downloadPdfExport(payload)`
- `parseAndValidateImport(jsonStr)`
- `resetAllLocalData()`

## Offline / Local Sandbox Mode

When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not configured **or the backend is unreachable**, Axon Logs automatically runs in **fully-offline mode**:

- Channels, E2EE messages, and settings are persisted in `localStorage` (`axon_chats`, `axon_messages`).
- A seeded `AXON_SANDBOX` terminal is created on first run; `?room=CODE` deep links auto-join matching local channels.
- Burn-on-read payloads auto-destruct after 10 seconds.
- File uploads work via data-URL encryption; voice memos render as audio players.
- The Supabase path is used automatically whenever credentials are present; if the backend is missing/misconfigured (e.g. tables not created yet), the app **degrades gracefully to LOCAL SANDBOX MODE** instead of alerting - it re-checks on reload once the schema exists.

## Supabase Setup

1. Paste `VITE_SUPABASE_URL` (the project API URL, e.g. `https://<ref>.supabase.co`) and `VITE_SUPABASE_ANON_KEY` into `.env.local` / the Keys tab.
2. Run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL editor. It creates the `chats` and `messages` tables, public RLS policies, realtime publication, and the `chat_files` storage bucket - all idempotent.
3. Reload the app: it boots in ONLINE mode and creates your first channel automatically.

## Recent Additions (Functional Pass)

- `LogsView.tsx` created (was missing -> fixed broken build + test Tier 1).
- Incoming transmission sound + desktop alert toggles (Settings > Alerts & Notifications).
- Slash commands `/help` and `/status`; `/ping` reports mode-aware latency.
- Copy join-code button in the terminal header; `?room=` deep-link join in offline mode.
- Voice memos now render as audio playback instead of raw base64.
- VideoTunnel fixes: removed pulse animation, proper stream cleanup, graceful camera failure.
- Simulated remote node (`/sim on|off` or the SIM NODE header toggle): a local bot transmits encrypted payloads with typing indicators, incoming-alert pings, and burn-on-read auto-destruct so the offline sandbox demos the full product.
- Typing indicator is now rendered in the terminal header (was tracked in state but never displayed).
- Payload incineration: hover a message you sent to burn it permanently (persisted in local mode, deleted from Supabase online).
- `.gitignore` fix: `logs` -> `/logs` so `src/components/logs/LogsView.tsx` is actually trackable.
- **Black screen fix**: `mic-recorder-to-mp3`'s UMD relied on an implicit global (`Lame=`) that Vite 8/Rolldown drops, crashing the whole bundle at module init (`ReferenceError: Lame is not defined`). Replaced it with the native `MediaRecorder` API in `VoiceRecorder.tsx` (WebM/Opus with mp4 fallback) and removed the dependency - voice memos work identically.
- **Chat locking (refresh re-prompt)**: every terminal is locked at boot - after a refresh the app restores the previously-active chat and demands its passphrase before decrypting anything. Unlock state is session-only (never persisted), the passphrase is hidden from the header while locked, and the input bar is disabled until decrypted. `/lock` (or the lock button) re-locks manually; idle re-auth also re-locks.
- **Per-chat passphrases + device keyring**: each terminal has its own user-set passphrase (create modal now suggests a strong `XXXX-XXXX-XXXX` key with a strength meter and min 6 chars). Keys for channels created/joined on the device are stored in `axon_device_keys` so the lock screen offers a click-to-reveal device-key hint - no lockout, still typed every session.
- **Brute-force lockout**: 5 failed passphrase attempts engage a 30s cooldown with a live countdown.
- **Global persistence & delete-everywhere**: `axon_active_chat_id` restores the exact chat on refresh; local sandbox data auto-migrates to the cloud on a healthy online boot (`migrateLocalToCloud`); realtime DELETE events are now handled so incinerated/deleted messages vanish on every connected client.

## Code Layout
- `src/App.tsx`: App root with context providers and view routing.
- `src/index.css`: Global styles & CSS variables (`--ui-text-size`, `--ui-card-padding`, `--ui-border-radius`).
- `src/contexts/ThemeContext.tsx`: Context provider for dynamic UI appearance and theme settings.
- `src/components/layout/Sidebar.tsx`: Collapsible navigation sidebar.
- `src/components/ai/AxonAIShell.tsx`: Axon AI assistant interface shell.
- `src/components/settings/SettingsPanel.tsx`: Dynamic Settings panel & Data Management UI.
- `src/components/logs/LogsView.tsx`: Dedicated system event logs view.
- `src/components/layout/TerminalUI.tsx`: Dashboard / Terminal chat workspace (refactored).
- `src/utils/dataManager.ts`: Data export, import, and reset utilities.

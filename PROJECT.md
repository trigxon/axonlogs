# Project: Axon Logs Platform Enhancement

## Architecture
- Tech Stack: React 19, Vite 8, TypeScript 6, Tailwind CSS 4, Lucide React, Framer Motion, MLC WebLLM.
- State Management: Custom React Context (`CryptoContext`, `ThemeContext` / `SettingsContext`). State-driven view navigation (`activeView: 'dashboard' | 'settings' | 'logs' | 'axon-ai'`).
- Layout Architecture:
  - Collapsible `Sidebar.tsx` navigation component on the left.
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
| M3 | Axon AI Interface Shell (R2) | Build `AxonAIShell.tsx` component with premium UI visual shell | M2 | IN_PROGRESS |
| M4 | Dynamic Settings System (R3) | Build `SettingsPanel.tsx` with dynamic appearance controls (text size, padding, border radius) | M1, M2 | IN_PROGRESS |
| M5 | Full Data Management Export/Import (R4) | Create `dataManager.ts` and integrate JSON/PDF Export, JSON Import, and Danger Zone Reset in `SettingsPanel.tsx` | M4 | IN_PROGRESS |
| M6 | Final Integration & E2E Acceptance Pass | E2E test verification, clean build (`npm run build`), dynamic CSS verification, export download verification, and Forensic Audit | M1-M5 | PLANNED |

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

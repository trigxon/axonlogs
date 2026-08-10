# Handoff Report: Architectural Survey for R1 (Sidebar Navigation) & R2 (Axon AI Shell)

**Agent**: Explorer 1 (Architecture & Navigation)  
**Date**: 2026-08-10  
**Target Path**: `c:\Users\50733\Desktop\AxonLogs\.agents\explorer_survey_1\handoff.md`

---

## 1. Observation

1. **Tech Stack & Dependencies (`package.json`)**:
   - **Framework**: React 19 (`react` ^19.2.8, `react-dom` ^19.2.8) with Vite 8 (`vite` ^8.2.0) & TypeScript (`typescript` ~6.0.2).
   - **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`, `tailwindcss` ^4.3.3) and custom CSS variables in `src/index.css`.
   - **Icons & Animation**: `lucide-react` ^1.30.0, `framer-motion` ^13.0.0.
   - **LLM / AI**: `@mlc-ai/web-llm` ^0.2.84.
   - **Routing**: No external routing library (such as `react-router-dom`) is installed. Navigation is state-driven inside top-level component state.
   - **Build Command**: `npm run build` runs `tsc -b && vite build`.

2. **Existing Layout & Component Structure (`src/components/layout/TerminalUI.tsx`)**:
   - `TerminalUI.tsx` is a monolithic 1233-line component that combines:
     - Left fixed sidebar (`<aside className="w-[260px] ...">`, lines 494–609) containing Branding, Terminals list, Join Link, Create Tunnel, Stealth Mode toggle, Settings button, Logs button, Terminate Session.
     - Main terminal chat workspace (`<main className="flex-1 flex flex-col ...">`, lines 612–894).
     - Modals for System Configuration (`showSettings`), Event Logs (`showLogs`), Create Tunnel, Rename, Key Rotation, and Unlock Terminal (lines 897–1226).

3. **Current Preexisting Build Errors (`npm run build`)**:
   - `src/components/chat/VoiceRecorder.tsx(2,23)`: `TS6133: 'X' is declared but its value is never read.`
   - `src/components/chat/VoiceRecorder.tsx(49,58)`: `TS6133: 'blob' is declared but its value is never read.`
   - `src/components/layout/TerminalUI.tsx(3,152)`: `TS6133: 'Square' is declared but its value is never read.`
   - `src/components/layout/TerminalUI.tsx(876,65)`: `TS2554: Expected 1-3 arguments, but got 4.` (Line 876 passes `activeChat.id` as 1st argument, but `sendMessage` signature in `CryptoContextType` expects `(text: string, file?: File | null, replyToId?: string | null)`).

---

## 2. Logic Chain

1. **R1 (Sidebar Navigation Structure) Requirements**:
   - The user requires a collapsible sidebar with links for:
     1. **Dashboard** (Main chat/terminal view)
     2. **Settings** (Customizable UI Text Size, Card Padding, Border Radius + Export/Import Data Management)
     3. **Logs** (System Event Logs view)
     4. **Axon AI** (Dedicated personal AI assistant shell view)
   - *Reasoning*: Because there is no router package, active view selection must be managed via a centralized view state (e.g. `activeView: 'dashboard' | 'settings' | 'logs' | 'axon-ai'`).
   - *Reasoning*: The existing fixed sidebar (`<aside className="w-[260px]">`) inside `TerminalUI.tsx` must be extracted into a modular `Sidebar.tsx` component that supports an `isCollapsed` state (`w-64` expanded, `w-16` / `w-20` collapsed) with a smooth toggle button and responsive tooltips/icons.

2. **R2 (Axon AI Interface Shell) Requirements**:
   - The user requires a dedicated UI view for "Axon AI" accessible from the sidebar.
   - *Reasoning*: Axon AI should be rendered in the main workspace when `activeView === 'axon-ai'`.
   - *Reasoning*: The Axon AI shell component (`src/components/ai/AxonAIShell.tsx`) must feature:
     - Header bar with bot identity ("AXON AI // Personal Intelligence Unit"), status badge ("LOCAL WEBGPU READY"), model info.
     - Quick Action / Suggestion Cards grid ("🔍 Analyze System Logs", "🛡️ Security Audit", "📊 Summarize Transmissions", "🔐 Draft Encrypted Message").
     - Interactive message feed displaying AI agent responses (with Markdown & syntax highlighting) and user prompts.
     - Interactive input bar with voice trigger, file attachment trigger, model capability badge, and execute button.

3. **Inter-Requirement Architectural Alignment (R3 & R4 Context)**:
   - R3 requires dynamic appearance styling (Text Size: Small/Medium/Large; Card Padding: Compact/Normal/Relaxed; Border Radius: Sharp/Rounded/Pill).
   - *Reasoning*: Creating a `ThemeContext` / `SettingsContext` or CSS root variables ensures that changing settings instantly updates the entire layout container without breaking existing styles.
   - R4 requires data export/import (JSON/PDF) and Danger Zone reset.
   - *Reasoning*: The Settings view (`src/components/settings/SettingsPanel.tsx`) will host both R3 appearance controls and R4 data management actions.

---

## 3. Caveats

- **No React Router**: Adding `react-router-dom` is unnecessary and would break existing state patterns; React state-based view switching is standard for this single-page terminal application architecture.
- **Preexisting TypeScript Errors**: `npm run build` currently fails due to 4 TS errors in `VoiceRecorder.tsx` and `TerminalUI.tsx`. The implementation team must clean up these unused imports and fix the argument mismatch on `sendMessage` to satisfy the acceptance criterion ("`npm run build` succeeds without TypeScript or ESLint errors").
- **WebGPU Support**: WebLLM requires WebGPU support in browser; the visual shell (R2) must display clean fallback/status badges if WebGPU is not available or model is loading.

---

## 4. Conclusion

### Architectural Design & Required Files

#### New Files to Create:
1. `src/components/layout/Sidebar.tsx`: Collapsible navigation sidebar (Dashboard, Settings, Logs, Axon AI, Channel List, Collapse Toggle).
2. `src/components/ai/AxonAIShell.tsx`: Premium visual shell view for Axon AI personal assistant.
3. `src/components/settings/SettingsPanel.tsx`: Dedicated settings view for R3 (UI Text Size, Card Padding, Border Radius) and R4 (Export/Import JSON/PDF, Danger Zone).
4. `src/components/logs/LogsView.tsx`: Dedicated system event logs view for R1 navigation.
5. `src/contexts/ThemeContext.tsx`: React context for dynamic UI styling (font size, padding, border radius).

#### Existing Files to Modify:
1. `src/App.tsx`: Provide `ThemeProvider` and render main application layout.
2. `src/components/layout/TerminalUI.tsx`: Refactor layout to fit clean view switcher and fix TS build errors (unused imports & `sendMessage` signature call).
3. `src/components/chat/VoiceRecorder.tsx`: Fix unused TS variables (`X`, `blob`).
4. `src/index.css`: Define CSS custom properties for dynamic text sizes (`--ui-text-size`), card padding (`--ui-card-padding`), and border radius (`--ui-border-radius`).

---

## 5. Verification Method

To verify the architecture and implementation:

1. **Build Check**:
   ```powershell
   npm run build
   ```
   *Expected Output*: TypeScript compilation succeeds with zero errors, Vite build creates `dist/`.

2. **Lint Check**:
   ```powershell
   npm run lint
   ```
   *Expected Output*: Oxlint runs with zero errors.

3. **Navigation & Views Inspection**:
   - Click collapsible sidebar toggle: Sidebar expands (`w-64`) and collapses (`w-16`).
   - Click "Dashboard": Renders terminal chat workspace.
   - Click "Axon AI": Renders Axon AI assistant shell view with status header, suggestion cards, prompt input.
   - Click "Settings": Renders dynamic settings panel.
   - Click "Logs": Renders event logs view.

## 2026-08-10T08:03:53Z
You are Implementation Worker for Milestones M3, M4, and M5.
Your working directory is: c:\Users\50733\Desktop\AxonLogs\.agents\worker_m3_m4_m5
The project workspace is: c:\Users\50733\Desktop\AxonLogs
Must read: c:\Users\50733\Desktop\AxonLogs\.agents\ORIGINAL_REQUEST.md and c:\Users\50733\Desktop\AxonLogs\PROJECT.md

MANDATORY INTEGRITY WARNING: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task:
1. Create your working directory c:\Users\50733\Desktop\AxonLogs\.agents\worker_m3_m4_m5 and update progress.md.

2. Milestone M3 (Axon AI Interface Shell R2):
   - Create `src/components/ai/AxonAIShell.tsx`: Premium visual shell view for "Axon AI" accessible from sidebar navigation when `activeView === 'axon-ai'`.
   - Include:
     - Header: "AXON AI // Personal Intelligence Unit", Status Badge ("LOCAL WEBGPU READY"), Model info badge.
     - Suggestion Cards grid ("Analyze System Logs", "Security Audit", "Summarize Transmissions", "Draft Encrypted Message").
     - Interactive Message Feed: user & assistant messages with styled code blocks, timestamps, action buttons.
     - Interactive Input Bar: text input, prompt trigger, file attachment button, send button.

3. Milestone M4 (Dynamic Settings System R3):
   - Create `src/components/settings/SettingsPanel.tsx`: Dedicated Settings panel view accessible when `activeView === 'settings'`.
   - Appearance section with controls for:
     - UI Text Size (Small: 12px, Medium: 14px, Large: 16px)
     - Card Padding (Compact: 8px, Normal: 16px, Relaxed: 24px)
     - Border Radius (Sharp: 0px, Rounded: 8px, Pill: 24px)
   - Connect controls to `useTheme()` from `ThemeContext.tsx` so selecting an option dynamically updates `--ui-text-size`, `--ui-card-padding`, and `--ui-border-radius` on `document.documentElement`.

4. Milestone M5 (Full Data Management Export/Import R4):
   - Create `src/utils/dataManager.ts`:
     - `exportAppData()`: Collects all decrypted chat messages, settings, known chats, alias, device ID, and system logs into a JSON object and triggers download of `axon_export_*.json`.
     - `exportPdfData()`: Generates and downloads formatted PDF file of logs and chats.
     - `importAppData(jsonStr)`: Validates uploaded JSON, restores local storage (`axon_alias`, `axon_known_chats`, `axon_settings`, etc.) and context state.
     - `resetAllLocalData()`: Clears all `axon_*` keys from `localStorage` and reloads window to clean state.
   - Integrate Export JSON button (triggering download), Export PDF button, Import JSON file input, and Danger Zone Reset button (with confirmation modal) into `SettingsPanel.tsx`.

5. Update `App.tsx` and `TerminalUI.tsx` to render `AxonAIShell` and `SettingsPanel` when navigated via `Sidebar`.

6. Run build & test checks:
   - `npm run build`
   - `npm test`
   Verify both succeed cleanly with 0 errors.

7. Write your handoff report to c:\Users\50733\Desktop\AxonLogs\.agents\worker_m3_m4_m5\handoff.md.
8. Send a message to parent (id: 95200db9-1182-46c0-b4f8-2e7a54ae2201) when complete.

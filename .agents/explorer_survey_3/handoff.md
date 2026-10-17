# Handoff Report — Explorer 3 (Data Management & Storage)

**Working Directory**: `c:\Users\50733\Desktop\AxonLogs\.agents\explorer_survey_3`  
**Project Workspace**: `c:\Users\50733\Desktop\AxonLogs`  
**Target Milestone**: R4 — Full Data Management (Export JSON/PDF, Import JSON, Danger Zone / Reset all local data)

---

## 1. Observation

### Existing Storage & State Architecture
1. **Local Storage Keys**:
   - `axon_deviceId`: String UUID generated on initialization (`src/contexts/CryptoContext.tsx:83-89`).
   - `axon_alias`: User station alias string (e.g. `NODE_A1B2`, `src/contexts/CryptoContext.tsx:84-93`).
   - `axon_known_chats`: JSON stringified array of string chat IDs (e.g. `["chat-uuid-1"]`, `src/contexts/CryptoContext.tsx:106, 135-140, 205-207`).
   - `axon_decoy_pass`: String decoy passphrase (default: `'DECOY123'`, `src/components/layout/TerminalUI.tsx:61, 943`).
   - `axon_keystroke_baseline`: String numerical timing baseline for plausible deniability unlock (`src/components/layout/TerminalUI.tsx:397-400`).
   - *(Planned for R3)* `axon_settings`: Dynamic UI settings object containing text size, card padding, border radius, and stealth mode.

2. **In-Memory React State & Data Models** (`src/contexts/CryptoContext.tsx`):
   - `Chat`: `{ id: string; name: string; share_code: string; created_at: string; }`
   - `Message`: `{ id: string; chat_id: string; sender_id: string; text: string; file_url: string | null; burn_on_read: boolean; reply_to_id?: string | null; read_by?: string[]; created_at: string; isDecryptionError?: boolean; }`
   - `SystemLog`: `{ id: string; time: string; msg: string; }`
   - `deviceId`, `alias`, `networkStatus`, `onlineUsers`, `typingUsers`

3. **Database & Backend Sync**:
   - Supabase client initialized via `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY` (`src/contexts/CryptoContext.tsx:60-62`).
   - Tables: `chats` (share_code, name) and `messages` (AES-encrypted `text` and `file_url` using `share_code` key via `CryptoJS.AES`).
   - Storage bucket: `chat_files` for attachment uploads.
   - Local fallback: When Supabase is unavailable, a mock local terminal (`LOCAL_FALLBACK`) is stored in state.

4. **Existing Session Reset Functionality**:
   - `TerminalUI.tsx:603`: `onClick={() => { localStorage.clear(); window.location.reload(); }}` (basic button under "TERMINATE SESSION").
   - `TerminalUI.tsx:968-980`: "NUCLEAR PURGE ACTIVE TERMINAL" under Danger Zone (deletes current active chat from Supabase/local state).

5. **Build Status & Pre-existing Compiler Errors**:
   - Executing `npm run build` failed with code 1 due to 4 TypeScript errors:
     - `src/components/chat/VoiceRecorder.tsx:2`: `'X' is declared but its value is never read.`
     - `src/components/chat/VoiceRecorder.tsx:49`: `'blob' is declared but its value is never read.`
     - `src/components/layout/TerminalUI.tsx:3`: `'Square' is declared but its value is never read.`
     - `src/components/layout/TerminalUI.tsx:876`: `sendMessage` call in `VoiceRecorder` callback passes 4 arguments `(activeChat.id, '', base64Audio, replyToId)` instead of expected 3 `(text, file, replyToId)`.

---

## 2. Logic Chain

1. **Absence of Full Data Management**:
   - The application has no existing Export JSON, Export PDF, or structured Import JSON functionality.
   - Data stored in `localStorage` and Supabase/memory is fragmented across separate keys and React context states.

2. **Unified Data Schema Requirement**:
   - To achieve lossless export and import, all local identity keys (`axon_deviceId`, `axon_alias`, `axon_decoy_pass`, `axon_keystroke_baseline`), dynamic settings (`textSize`, `cardPadding`, `borderRadius`, `stealthMode`), known chat channels, active chat messages (decrypted), and system logs must be serialized into a single versioned JSON payload (`AxonExportPayload`).

3. **JSON Export Implementation Strategy**:
   - Create `src/utils/dataManager.ts` providing `downloadJsonExport(data, filename)`.
   - Use `Blob([jsonString], { type: 'application/json' })` and `URL.createObjectURL` to trigger direct browser download without server dependencies.

4. **PDF Export Implementation Strategy**:
   - Create `downloadPdfExport(data, filename)` in `src/utils/dataManager.ts`.
   - Produce a styled PDF Blob or launch an offscreen printable container formatted with Axon monospace styling, timestamps, active node lists, terminal history, and configuration state, converting cleanly to PDF.

5. **JSON Import Implementation Strategy**:
   - Provide `parseAndValidateImport(jsonStr)` to validate JSON structure (checking version, identity, chats, messages, settings).
   - Provide `importDataPayload(payload)` to write restored values to `localStorage` (`axon_alias`, `axon_known_chats`, `axon_decoy_pass`, `axon_settings`) and update `CryptoContext` state dynamically.

6. **Danger Zone & Data Reset**:
   - Enhance the Danger Zone in the Settings Panel with a prominent "RESET ALL LOCAL DATA" action.
   - Require double confirmation ("Type RESET to confirm" or confirmation dialog).
   - Execute complete purge: remove all `axon_*` keys from `localStorage`, clear React message/chat state, and reload application window to return to clean state.

---

## 3. Caveats

1. **Decrypted vs Encrypted Chat Data**:
   - Requirement R4 explicitly mandates exporting *full decrypted chats*. Therefore, the exported JSON/PDF payloads will contain plain-text messages decrypted with their respective terminal share codes.
   - Implementers should include a security notice in the UI: "Exported files contain decrypted message payloads."

2. **Supabase Remote Messages**:
   - Messages are fetched per active chat on demand from Supabase.
   - The export feature will export all currently loaded/cached messages and chats in React state. If full historical sync across all terminals is desired, `CryptoContext` should fetch all messages for all known chats prior to export.

3. **Pre-existing Build Blockers**:
   - Implementers must fix the 4 pre-existing TypeScript errors in `VoiceRecorder.tsx` and `TerminalUI.tsx` before `npm run build` will succeed.

---

## 4. Conclusion

### Target Files to Create / Modify

1. **New Utility File**: `src/utils/dataManager.ts`
   - Data Export & Import schemas (`AxonExportPayload`, `AppSettingsState`).
   - `downloadJsonExport(payload: AxonExportPayload)`: Triggers JSON backup download.
   - `downloadPdfExport(payload: AxonExportPayload)`: Generates and downloads PDF log document.
   - `parseAndValidateImport(jsonStr: string)`: Validates uploaded JSON format.
   - `resetAllLocalData()`: Clears all `axon_*` keys from `localStorage`.

2. **Context Extension**: `src/contexts/CryptoContext.tsx`
   - Add `exportAppData()` method returning complete `AxonExportPayload`.
   - Add `importAppData(payload: AxonExportPayload)` method updating state and local storage.
   - Add `resetAppData()` method performing full local wipe.

3. **UI Integration**: `src/components/layout/TerminalUI.tsx` (or `SettingsModal.tsx` / `DataManagementPanel.tsx`)
   - Add **Data Management** section in Settings panel with:
     - "Export JSON" button
     - "Export PDF" button
     - "Import JSON" file input with drag-and-drop or click trigger
     - Danger Zone "Reset All Local Data" button with confirmation modal.

---

## 5. Verification Method

### Step 1: Fix Pre-existing TypeScript Errors
Run:
```bash
npm run build
```
Verify that unused imports in `VoiceRecorder.tsx` and `TerminalUI.tsx` and the argument mismatch on line 876 of `TerminalUI.tsx` are resolved.

### Step 2: Test JSON Export
1. Launch app using `npm run dev`.
2. Open Settings Panel -> Data Management -> Click **Export JSON**.
3. Inspect downloaded `axon_export_*.json` file and verify fields: `version`, `exportedAt`, `identity`, `settings`, `knownChats`, `chats`, `messages`, `systemLogs`.

### Step 3: Test PDF Export
1. Click **Export PDF**.
2. Verify downloaded PDF file opens correctly and renders formatted terminal header, alias, settings summary, and chat transcripts.

### Step 4: Test JSON Import
1. Modify alias or add messages.
2. Click **Import JSON** and select a valid backup JSON file.
3. Confirm that alias, chats, settings, and messages are restored accurately.

### Step 5: Test Danger Zone Reset
1. Under Settings -> Danger Zone -> Click **Reset All Local Data**.
2. Confirm the warning prompt.
3. Verify `localStorage` keys starting with `axon_` are cleared and app resets to clean initial state.

# Original User Request

## 2026-08-10T07:56:50Z

<USER_REQUEST>
Enhance the existing Axon Logs platform by introducing a comprehensive Settings Panel (for UI scaling, padding, and data management), a structured Sidebar for navigation, and a dedicated personal AI assistant named "Axon AI" integrated into the sidebar.

Working directory: c:\Users\50733\Desktop\AxonLogs
Integrity mode: development

## Requirements

### R1. Sidebar Navigation Structure
Add a structured, collapsible sidebar to replace or augment the existing navigation. It should include links for Dashboard, Settings, Logs, and a dedicated button for the "Axon AI" personal assistant.

### R2. Axon AI Interface Shell
Create a dedicated UI view for "Axon AI" accessible from the sidebar. Just build the premium visual interface (shell) for it; it does not need to be wired to the actual WebLLM engine yet.

### R3. Dynamic Settings System
Implement a settings panel that allows customizing UI Text Size (Small, Medium, Large), Card Padding (Compact, Normal, Relaxed), and Border Radius (Sharp, Rounded, Pill). These settings must dynamically update the application's appearance using React state or CSS variables.

### R4. Full Data Management (Export/Import)
Provide functionality in the settings panel to Export all app data (full decrypted chats, settings, and keys) as JSON or PDF, and Import data (JSON) to restore it. Include a "Danger Zone" button to reset and delete all local data.

## Acceptance Criteria

### Programmatic & Functional Verification
- [ ] Running `npm run build` succeeds without TypeScript or ESLint errors.
- [ ] Modifying the UI Text Size, Card Padding, or Border Radius in the settings panel demonstrably updates the CSS properties of the main layout components.
- [ ] Clicking the "Export JSON" button generates and triggers a download of a JSON object containing the current chat messages and configuration state.
- [ ] The "Axon AI" view renders successfully when navigated to from the sidebar.
</USER_REQUEST>

# Explorer Handoff Report — Explorer 2 (Settings & Dynamic CSS)

## 1. Observation

### 1.1 Project Structure & Dependencies
- `package.json`:
  - Lines 12-32: React 19 (`react`: `^19.2.8`), Tailwind CSS v4 (`tailwindcss`: `^4.3.3`, `@tailwindcss/vite`: `^4.3.3`), `clsx`: `^2.1.1`, `tailwind-merge`: `^3.6.0`, `lucide-react`: `^1.30.0`, `framer-motion`: `^13.0.0`, `@mlc-ai/web-llm`: `^0.2.84`, `crypto-js`: `^4.2.0`.
  - Line 8: Build script `"build": "tsc -b && vite build"`.

### 1.2 Global Styling & Theme Setup
- `src/index.css`:
  - Lines 4-13: `@theme` mapping CSS variables:
    ```css
    @theme {
      --color-background: var(--bg);
      --color-panel: var(--panel);
      --color-accent: var(--accent);
      --color-accent-hover: var(--accent-hover);
      --color-text-primary: var(--text-primary);
      --color-text-secondary: var(--text-secondary);
      --color-border: var(--border);
      --color-danger: #ef4444;
    }
    ```
  - Lines 16-27: `:root` CSS custom variables:
    ```css
    :root {
      --bg: #050505;
      --panel: #0a0a0f;
      --text-primary: #a3a3a3;
      --text-secondary: #52525b;
      --border: #27272a;
      --accent: #22d3ee;
      --accent-hover: #06b6d4;
      --font-mono: 'Fira Code', monospace;
    }
    ```
  - Lines 29-32: Base body styling applying `font-family: var(--font-mono); bg-background text-text-primary`.

### 1.3 Application Layout & Components
- `src/App.tsx`:
  - Lines 4-10: `App` component wraps `<TerminalUI />` inside `<CryptoProvider>`.
- `src/components/layout/TerminalUI.tsx`:
  - Lines 493-609: `<aside>` sidebar rendered on the left (`w-[260px] flex-shrink-0 bg-[#080808] border-r border-zinc-900`).
  - Lines 612 border/containers: Main container (`<main className="flex-1 flex flex-col min-w-0 bg-[#050505]">`).
  - Lines 615-646: Top header bar (`h-14 border-b border-zinc-900`).
  - Lines 681-801: Chat message list/feed with card elements (`className="flex flex-col w-full max-w-3xl border p-4 relative group ..."`).
  - Lines 897-985: Modal overlay for System Configuration (`showSettings`).
- `src/contexts/CryptoContext.tsx`:
  - Lines 82-99: Identifiers saved in `localStorage`: `axon_deviceId`, `axon_alias`.
  - Line 106: Chat IDs stored in `localStorage` as `axon_known_chats`.
  - Line 942: Decoy passphrase stored in `localStorage` as `axon_decoy_pass`.

---

## 2. Logic Chain

1. **Step 1: Analyzing Requirement R3 (Dynamic Settings System)**
   - Requirement R3 states: "Implement a settings panel that allows customizing UI Text Size (Small, Medium, Large), Card Padding (Compact, Normal, Relaxed), and Border Radius (Sharp, Rounded, Pill). These settings must dynamically update the application's appearance using React state or CSS variables."
   - From Observation 1.2 (`src/index.css`), the application relies heavily on CSS variables set on `:root` (`--bg`, `--panel`, `--text-primary`, `--border`, etc.).
   - Setting root CSS variables (`--ui-text-size`, `--ui-card-padding`, `--ui-border-radius`) dynamically via JavaScript (`document.documentElement.style.setProperty(...)`) propagates instantly to all CSS styling rules and inline style bindings across the document without requiring component re-renders or CSS file reloads.
   - Component card elements (such as message cards in `TerminalUI.tsx:721`, modal boxes in `TerminalUI.tsx:899`, inputs, and sidebar buttons) can reference these CSS variables directly (e.g. `style={{ padding: 'var(--ui-card-padding)', borderRadius: 'var(--ui-border-radius)', fontSize: 'var(--ui-text-size)' }}` or via root CSS rules targetting card classes).

2. **Step 2: Concrete Value Mappings for R3 Settings**
   - **UI Text Size**:
     - `small`: `12px` (`0.75rem`)
     - `medium` (default): `14px` (`0.875rem`)
     - `large`: `16px` (`1rem`)
   - **Card Padding**:
     - `compact`: `8px` (`0.5rem`)
     - `normal` (default): `16px` (`1rem`)
     - `relaxed`: `24px` (`1.5rem`)
   - **Border Radius**:
     - `sharp`: `0px`
     - `rounded` (default): `8px` (`0.5rem`)
     - `pill`: `24px` (`1.5rem`)

3. **Step 3: Analyzing Requirement R4 (Full Data Management Export/Import & Reset)**
   - Export functionality must serialize all persistent data stored in `localStorage` (`axon_settings`, `axon_alias`, `axon_deviceId`, `axon_known_chats`, `axon_decoy_pass`) and active messages into a downloadable JSON file.
   - Import functionality reads a JSON file via `FileReader`, validates structure, populates `localStorage` items, and updates state context.
   - Reset ("Danger Zone") clears `localStorage.clear()` and reloads/resets the React app state.

4. **Step 4: Designing State Architecture & Integration**
   - Create a dedicated React context `SettingsContext` in `src/contexts/SettingsContext.tsx`.
   - `SettingsContext` maintains state for `textSize`, `cardPadding`, and `borderRadius`.
   - On state initialization and change, `SettingsContext`:
     - Reads/Writes settings object from/to `localStorage.getItem('axon_settings')`.
     - Updates CSS variables on `document.documentElement`:
       ```ts
       document.documentElement.style.setProperty('--ui-text-size', textSizeMap[textSize]);
       document.documentElement.style.setProperty('--ui-card-padding', cardPaddingMap[cardPadding]);
       document.documentElement.style.setProperty('--ui-border-radius', borderRadiusMap[borderRadius]);
       ```
   - `SettingsProvider` wraps the app component tree in `App.tsx`.

---

## 3. Caveats

- **CSS Selectors vs Inline Variable Consumption**: In existing components, several Tailwind classes (e.g. `p-4`, `rounded`, `text-sm`) are hardcoded. To ensure dynamic updates visibly reflect everywhere on main layout components, key layout containers (cards, sidebars, modals, message items, buttons) should utilize CSS variables via inline `style` or helper utility classes connected to `--ui-text-size`, `--ui-card-padding`, and `--ui-border-radius`.
- **LocalStorage Data Persistence**: Clearing local storage in the "Danger Zone" will clear local chat history pointers (`axon_known_chats`), alias, and UI settings.

---

## 4. Conclusion

### 4.1 Recommended Implementation Architecture

#### Files to Create:
1. `src/contexts/SettingsContext.tsx`:
   - Defines `UISettings` type (`textSize`: `'small'|'medium'|'large'`, `cardPadding`: `'compact'|'normal'|'relaxed'`, `borderRadius`: `'sharp'|'rounded'|'pill'`).
   - Manages state, updates `localStorage`, and updates `--ui-text-size`, `--ui-card-padding`, `--ui-border-radius` on `document.documentElement`.
   - Provides functions for `exportData()`, `importData(jsonString)`, and `resetAllData()`.

2. `src/components/settings/SettingsPanel.tsx`:
   - Contains UI controls for Text Size (Small, Medium, Large), Card Padding (Compact, Normal, Relaxed), Border Radius (Sharp, Rounded, Pill).
   - Contains Export Data (JSON), Import Data (JSON upload), and Danger Zone Reset buttons.

#### Files to Modify:
1. `src/index.css`:
   - Add `:root` variable definitions:
     ```css
     --ui-text-size: 14px;
     --ui-card-padding: 16px;
     --ui-border-radius: 8px;
     ```
   - Add base rules or utility classes using these variables so cards, text elements, and buttons inherit them smoothly.

2. `src/App.tsx`:
   - Wrap `<TerminalUI />` with `<SettingsProvider>`.

3. `src/components/layout/TerminalUI.tsx` (and new layout/sidebar components):
   - Update message cards, modal cards, inputs, and layout blocks to apply dynamic style variables for padding, border radius, and text size.

---

## 5. Verification Method

1. **Build Verification**:
   - Run command: `npm run build`
   - Expected result: TypeScript compilation and Vite bundling succeed with zero errors.

2. **Dynamic CSS Verification**:
   - Inspect main layout components (`TerminalUI` cards, modals, message containers).
   - Modify UI Text Size, Card Padding, or Border Radius options in Settings.
   - Inspect computed CSS properties on `document.documentElement` (`--ui-text-size`, `--ui-card-padding`, `--ui-border-radius`) and observe instant computed visual change on layout elements.

3. **Data Management Verification**:
   - Click "Export JSON" and verify downloaded `.json` file content structure.
   - Test JSON import to restore settings and chat state.
   - Test "Danger Zone" reset button to verify `localStorage` wipe and application state reset.

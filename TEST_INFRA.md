# Axon Logs Platform E2E & Integrated Test Infrastructure

## Overview & Philosophy
The Axon Logs test infrastructure provides end-to-end (E2E), integration, and interface contract verification across all project requirements (R1: Sidebar Navigation, R2: Axon AI Shell, R3: Dynamic Settings System, R4: Full Data Management Export/Import/Reset) and acceptance criteria (`npm run build`).

The test runner is built natively with TypeScript and Node.js (`node --experimental-strip-types`), requiring no extra test harness overhead while providing fast, reliable, zero-dependency test execution.

---

## Test Architecture & Tiers

The test suite is structured into 4 distinct verification tiers:

### Tier 1: Build Compilation & View Navigation
- **Scope**:
  - **Tier 1.1**: Verifies clean build compilation (`npm run build` via `tsc -b && vite build`) with zero TypeScript or build errors.
  - **Tier 1.2**: Verifies the View Navigation contract interface across views (`'dashboard'`, `'settings'`, `'logs'`, `'axon-ai'`).
- **File**: `tests/tier1_build_and_navigation.test.ts`

### Tier 2: Dynamic Settings CSS Properties
- **Scope**:
  - **Tier 2.1**: Verifies CSS variable mappings on root:
    - `--ui-text-size`: `small` (`12px`), `medium` (`14px`), `large` (`16px`)
    - `--ui-card-padding`: `compact` (`8px`), `normal` (`16px`), `relaxed` (`24px`)
    - `--ui-border-radius`: `sharp` (`0px`), `rounded` (`8px`), `pill` (`24px`)
  - **Tier 2.2**: Verifies root DOM CSS variable injection and `ThemeContext.tsx` references.
- **File**: `tests/tier2_dynamic_settings.test.ts`

### Tier 3: Full Data Management Export & Import
- **Scope**:
  - **Tier 3.1**: Verifies Export JSON trigger and payload structure against `AxonExportPayload` specification (`version`, `exportedAt`, `identity`, `settings`, `knownChats`, `chats`, `messages`, `systemLogs`).
  - **Tier 3.2**: Verifies Import JSON parsing and schema validation edge cases (valid JSON, malformed syntax, incomplete payload schema).
- **File**: `tests/tier3_data_export_import.test.ts`

### Tier 4: Danger Zone Local Data Reset
- **Scope**:
  - **Tier 4.1**: Verifies `resetAllLocalData` logic, wiping local storage entries (`axon_settings`, `axon_identity`, `axon_chats`, `axon_messages`, `axon_logs`) and ensuring complete data reset.
- **File**: `tests/tier4_danger_zone_reset.test.ts`

---

## How to Run Tests

### Command
To execute the complete test suite:

```bash
npm test
```

Or directly via Node:

```bash
node --experimental-strip-types tests/run-all.ts
```

### Execution Behavior
- Runs all 4 tiers sequentially.
- Outputs detailed execution timing and pass/fail indicators per test.
- Returns exit code `0` on success and `1` on failure.

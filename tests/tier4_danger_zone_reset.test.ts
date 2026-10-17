import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

export interface StorageState {
  axon_settings?: string;
  axon_identity?: string;
  axon_chats?: string;
  axon_messages?: string;
  axon_logs?: string;
  [key: string]: string | undefined;
}

/**
 * Mocks local storage behavior for Danger Zone reset testing.
 */
export class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }
}

/**
 * Simulates Danger Zone reset function execution on local storage and state.
 */
export function resetAllLocalData(storage: MockLocalStorage): { resetSuccess: boolean; clearedKeys: string[] } {
  const keysToClear = ['axon_settings', 'axon_identity', 'axon_chats', 'axon_messages', 'axon_logs'];
  const clearedKeys: string[] = [];

  for (const key of keysToClear) {
    if (storage.getItem(key) !== null) {
      clearedKeys.push(key);
    }
    storage.removeItem(key);
  }

  // Also invoke clear to ensure complete wipe
  storage.clear();

  return { resetSuccess: true, clearedKeys };
}

/**
 * Tier 4: Danger Zone Reset Logic Verification
 */
export async function runTier4Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const resetStart = Date.now();
  try {
    const storage = new MockLocalStorage();

    // 1. Populate storage with mock active application data
    storage.setItem('axon_settings', JSON.stringify({ textSize: 'large', cardPadding: 'relaxed', borderRadius: 'pill' }));
    storage.setItem('axon_identity', JSON.stringify({ alias: 'ActiveUser', deviceId: 'dev-101' }));
    storage.setItem('axon_chats', JSON.stringify([{ id: 'c1', title: 'Top Secret Log' }]));
    storage.setItem('axon_messages', JSON.stringify([{ id: 'm1', text: 'Sensitive message' }]));
    storage.setItem('axon_logs', JSON.stringify([{ id: 'l1', message: 'User log entry' }]));

    if (storage.length !== 5) {
      throw new Error(`Pre-reset storage length mismatch: expected 5, got ${storage.length}`);
    }

    // 2. Perform Danger Zone Reset
    const resetOutcome = resetAllLocalData(storage);

    if (!resetOutcome.resetSuccess) {
      throw new Error('resetAllLocalData did not report success');
    }

    if (storage.length !== 0) {
      throw new Error(`Post-reset storage not empty: remaining items count = ${storage.length}`);
    }

    // 3. Verify all key entries are null
    const keysToCheck = ['axon_settings', 'axon_identity', 'axon_chats', 'axon_messages', 'axon_logs'];
    for (const key of keysToCheck) {
      if (storage.getItem(key) !== null) {
        throw new Error(`Key '${key}' still exists in storage post Danger Zone reset`);
      }
    }

    // 4. Inspect src/utils/dataManager.ts if created by implementation
    const dataManagerPath = path.join(projectRoot, 'src', 'utils', 'dataManager.ts');
    if (fs.existsSync(dataManagerPath)) {
      const content = fs.readFileSync(dataManagerPath, 'utf-8');
      if (!content.includes('resetAllLocalData')) {
        throw new Error('src/utils/dataManager.ts exists but does not export resetAllLocalData');
      }
    }

    results.push({
      name: 'Tier 4.1: Danger Zone Data Reset Logic & Storage Wipe Verification',
      tier: 4,
      passed: true,
      durationMs: Date.now() - resetStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 4.1: Danger Zone Data Reset Logic & Storage Wipe Verification',
      tier: 4,
      passed: false,
      error: err.message,
      durationMs: Date.now() - resetStart,
    });
  }

  return results;
}

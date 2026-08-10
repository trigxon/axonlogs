import { 
  validateExportPayload, 
  parseAndValidateImport, 
  collectExportPayload, 
  importAppData, 
  resetAllLocalData, 
  downloadJsonExport, 
  downloadPdfExport,
  type AxonExportPayload 
} from '../../src/utils/dataManager.ts';

// Mock localStorage implementation for Node environment testing
class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

// Global DOM mock for download trigger empirical testing
function setupMockDom() {
  const mockElements: any[] = [];
  let revokeCount = 0;

  (globalThis as any).Blob = class MockBlob {
    content: any[];
    type: string;
    constructor(content: any[], options?: { type?: string }) {
      this.content = content;
      this.type = options?.type || '';
    }
  };

  (globalThis as any).URL = {
    createObjectURL: (blob: any) => `blob:http://localhost/${Math.random().toString(36).substring(2)}`,
    revokeObjectURL: (url: string) => { revokeCount++; }
  };

  (globalThis as any).document = {
    createElement: (tag: string) => {
      const el = {
        tag,
        href: '',
        download: '',
        clickCount: 0,
        click() { this.clickCount++; }
      };
      mockElements.push(el);
      return el;
    },
    body: {
      appendChild: (el: any) => {},
      removeChild: (el: any) => {}
    }
  };

  return { mockElements, getRevokeCount: () => revokeCount };
}

async function runEmpiricalStressTests() {
  console.log('====================================================');
  console.log('  CHALLENGER 1: EMPIRICAL STRESS & INTEGRITY HARNESS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
      failed++;
    }
  }

  // Set up mock localStorage globally
  const mockStorage = new MockStorage();
  (globalThis as any).localStorage = mockStorage;

  // ----------------------------------------------------
  // TEST GROUP 1: Export Payload Collection & Fallbacks
  // ----------------------------------------------------
  console.log('--- Group 1: Export Payload Collection & Storage Fallbacks ---');
  mockStorage.clear();
  const emptyPayload = collectExportPayload();
  assert(emptyPayload.version === '1.0.0', 'Group 1.1: Default version is 1.0.0');
  assert(emptyPayload.identity.alias === 'NODE_OPERATOR', 'Group 1.2: Fallback identity alias is NODE_OPERATOR');
  assert(emptyPayload.identity.deviceId === 'DEV_LOCAL', 'Group 1.3: Fallback identity deviceId is DEV_LOCAL');
  assert(emptyPayload.settings.textSize === 'medium', 'Group 1.4: Fallback textSize is medium');
  assert(emptyPayload.settings.cardPadding === 'normal', 'Group 1.5: Fallback cardPadding is normal');
  assert(emptyPayload.settings.borderRadius === 'rounded', 'Group 1.6: Fallback borderRadius is rounded');
  assert(Array.isArray(emptyPayload.chats) && emptyPayload.chats.length === 0, 'Group 1.7: Fallback chats is empty array');

  // Test corrupt JSON in localStorage for chats/messages/logs
  mockStorage.setItem('axon_chats', 'CORRUPTED_NON_JSON_STRING{{{');
  mockStorage.setItem('axon_messages', 'INVALID_JSON');
  mockStorage.setItem('axon_logs', 'NOT_JSON');
  const payloadWithCorruptStorage = collectExportPayload();
  assert(Array.isArray(payloadWithCorruptStorage.chats) && payloadWithCorruptStorage.chats.length === 0, 'Group 1.8: Corrupt storage JSON recovers gracefully with empty array fallback for chats');
  assert(Array.isArray(payloadWithCorruptStorage.messages) && payloadWithCorruptStorage.messages.length === 0, 'Group 1.9: Corrupt storage JSON recovers gracefully for messages');
  assert(Array.isArray(payloadWithCorruptStorage.systemLogs) && payloadWithCorruptStorage.systemLogs.length === 0, 'Group 1.10: Corrupt storage JSON recovers gracefully for systemLogs');

  // ----------------------------------------------------
  // TEST GROUP 2: Export JSON & PDF Download Triggers
  // ----------------------------------------------------
  console.log('\n--- Group 2: DOM Download Trigger Verification ---');
  const domMock = setupMockDom();
  mockStorage.setItem('axon_alias', 'CHALLENGER_BOT');
  mockStorage.setItem('axon_deviceId', 'DEV-STRESS-01');

  try {
    downloadJsonExport();
    const lastEl = domMock.mockElements[domMock.mockElements.length - 1];
    assert(lastEl && lastEl.tag === 'a', 'Group 2.1: JSON export creates anchor element');
    assert(lastEl.download.startsWith('axon_export_') && lastEl.download.endsWith('.json'), 'Group 2.2: JSON export filename has correct pattern', `Got ${lastEl.download}`);
    assert(lastEl.clickCount === 1, 'Group 2.3: JSON export element clicked once');
  } catch (err: any) {
    assert(false, 'Group 2.1-2.3: JSON export trigger threw error', err.message);
  }

  try {
    downloadPdfExport();
    const lastEl = domMock.mockElements[domMock.mockElements.length - 1];
    assert(lastEl && lastEl.tag === 'a', 'Group 2.4: PDF export creates anchor element');
    assert(lastEl.download.startsWith('axon_export_') && lastEl.download.endsWith('.pdf'), 'Group 2.5: PDF export filename has correct pattern', `Got ${lastEl.download}`);
    assert(lastEl.clickCount === 1, 'Group 2.6: PDF export element clicked once');
  } catch (err: any) {
    assert(false, 'Group 2.4-2.6: PDF export trigger threw error', err.message);
  }

  // ----------------------------------------------------
  // TEST GROUP 3: Import Parsing & Schema Edge Cases
  // ----------------------------------------------------
  console.log('\n--- Group 3: Import Parsing & Schema Edge Cases ---');

  // 3.1 Null / Primitive inputs
  const rNull = parseAndValidateImport('null');
  assert(!rNull.success, 'Group 3.1: Null JSON input rejected');

  const rNum = parseAndValidateImport('12345');
  assert(!rNum.success, 'Group 3.2: Numeric JSON input rejected');

  const rStr = parseAndValidateImport('"just a string"');
  assert(!rStr.success, 'Group 3.3: String JSON input rejected');

  const rArray = parseAndValidateImport('[1, 2, 3]');
  assert(!rArray.success, 'Group 3.4: Array JSON input rejected');

  // 3.2 Invalid Date in exportedAt
  const invalidDatePayload = JSON.stringify({
    version: '1.0.0',
    exportedAt: 'NOT_A_DATE',
    identity: { alias: 'A', deviceId: 'B' },
    settings: { textSize: 'small', cardPadding: 'compact', borderRadius: 'sharp' },
    knownChats: [],
    chats: [],
    messages: [],
    systemLogs: []
  });
  const rDate = parseAndValidateImport(invalidDatePayload);
  assert(!rDate.success && rDate.error?.includes('exportedAt'), 'Group 3.5: Invalid exportedAt ISO date rejected');

  // 3.3 Missing or non-string identity fields
  const invalidIdentityPayload = JSON.stringify({
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    identity: { alias: 123, deviceId: null },
    settings: { textSize: 'small', cardPadding: 'compact', borderRadius: 'sharp' },
    knownChats: [], chats: [], messages: [], systemLogs: []
  });
  const rIdent = parseAndValidateImport(invalidIdentityPayload);
  assert(!rIdent.success && rIdent.error?.includes('identity.alias'), 'Group 3.6: Non-string identity fields rejected');

  // 3.4 Non-array fields
  const nonArrayPayload = JSON.stringify({
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    identity: { alias: 'A', deviceId: 'B' },
    settings: { textSize: 'small', cardPadding: 'compact', borderRadius: 'sharp' },
    knownChats: 'NOT_AN_ARRAY',
    chats: [], messages: [], systemLogs: []
  });
  const rNonArr = parseAndValidateImport(nonArrayPayload);
  assert(!rNonArr.success && rNonArr.error?.includes('knownChats'), 'Group 3.7: Non-array knownChats rejected');

  // 3.5 Prototype pollution payload attempt
  const protoPayload = '{"__proto__":{"polluted":true},"version":"1.0.0","exportedAt":"2026-08-10T08:00:00.000Z","identity":{"alias":"A","deviceId":"B"},"settings":{"textSize":"small","cardPadding":"compact","borderRadius":"sharp"},"knownChats":[],"chats":[],"messages":[],"systemLogs":[]}';
  const rProto = parseAndValidateImport(protoPayload);
  assert(rProto.success, 'Group 3.8: Valid payload with __proto__ parses safely without crash');
  assert(({} as any).polluted === undefined, 'Group 3.9: Prototype is not polluted by import parsing');

  // 3.6 High volume stress payload (1,000 chats, 5,000 messages, 5,000 logs)
  console.log('Building large stress payload (10,000 items)...');
  const heavyChats = Array.from({ length: 1000 }, (_, i) => ({ id: `c_${i}`, title: `Terminal Chat ${i}` }));
  const heavyMsgs = Array.from({ length: 5000 }, (_, i) => ({ id: `m_${i}`, text: `Decrypted message text log line ${i} with encryption tokens`, created_at: new Date().toISOString() }));
  const heavyLogs = Array.from({ length: 5000 }, (_, i) => ({ id: `l_${i}`, message: `System log telemetry ${i}`, time: new Date().toISOString() }));

  const heavyPayload: AxonExportPayload = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    identity: { alias: 'STRESS_OPERATOR', deviceId: 'PERF_BENCH_01' },
    settings: { textSize: 'large', cardPadding: 'relaxed', borderRadius: 'pill' },
    knownChats: heavyChats.map(c => c.id),
    chats: heavyChats,
    messages: heavyMsgs,
    systemLogs: heavyLogs
  };

  const heavyJson = JSON.stringify(heavyPayload);
  const parseStart = Date.now();
  const rHeavy = parseAndValidateImport(heavyJson);
  const parseDuration = Date.now() - parseStart;
  assert(rHeavy.success, 'Group 3.10: High volume stress payload (10,000 items) validated successfully');
  assert(parseDuration < 500, `Group 3.11: Heavy JSON parsing fast (${parseDuration}ms < 500ms)`);

  // ----------------------------------------------------
  // TEST GROUP 4: Import Roundtrip & LocalStorage State Restoral
  // ----------------------------------------------------
  console.log('\n--- Group 4: Import Roundtrip & Storage Synchronization ---');
  mockStorage.clear();
  const importResult = importAppData(heavyJson);
  assert(importResult.success, 'Group 4.1: importAppData executed with success');
  assert(mockStorage.getItem('axon_alias') === 'STRESS_OPERATOR', 'Group 4.2: Storage axon_alias restored');
  assert(mockStorage.getItem('axon_text_size') === 'large', 'Group 4.3: Storage axon_text_size restored');
  assert(mockStorage.getItem('axon_card_padding') === 'relaxed', 'Group 4.4: Storage axon_card_padding restored');
  assert(mockStorage.getItem('axon_border_radius') === 'pill', 'Group 4.5: Storage axon_border_radius restored');
  
  const restoredChats = JSON.parse(mockStorage.getItem('axon_chats') || '[]');
  assert(restoredChats.length === 1000, 'Group 4.6: All 1,000 chats restored in localStorage');

  const restoredMsgs = JSON.parse(mockStorage.getItem('axon_messages') || '[]');
  assert(restoredMsgs.length === 5000, 'Group 4.7: All 5,000 messages restored in localStorage');

  // ----------------------------------------------------
  // TEST GROUP 5: Danger Zone Local Storage Wiping
  // ----------------------------------------------------
  console.log('\n--- Group 5: Danger Zone Local Storage Wiping Verification ---');
  // Add additional custom keys to mock storage
  mockStorage.setItem('axon_decoy_pass', 'SECRET_DECOY');
  mockStorage.setItem('axon_keystroke_baseline', 'BASELINE_DATA');
  mockStorage.setItem('custom_user_key', 'NON_AXON_KEY');

  assert(mockStorage.length > 5, 'Group 5.1: Storage populated with multiple keys before reset');

  const resetResult = resetAllLocalData(mockStorage);
  assert(resetResult.resetSuccess === true, 'Group 5.2: resetAllLocalData returned resetSuccess: true');
  assert(mockStorage.length === 0, 'Group 5.3: Storage length is 0 post reset (complete wipe)');
  assert(mockStorage.getItem('axon_alias') === null, 'Group 5.4: axon_alias is null');
  assert(mockStorage.getItem('axon_settings') === null, 'Group 5.5: axon_settings is null');
  assert(mockStorage.getItem('axon_chats') === null, 'Group 5.6: axon_chats is null');
  assert(mockStorage.getItem('axon_messages') === null, 'Group 5.7: axon_messages is null');
  assert(mockStorage.getItem('axon_decoy_pass') === null, 'Group 5.8: axon_decoy_pass is null');

  // Test reset with fallback empty storage object (when localStorage is undefined or custom)
  const emptyStorageObj = {} as Storage;
  const resetEmptyResult = resetAllLocalData(emptyStorageObj);
  assert(resetEmptyResult.resetSuccess === true, 'Group 5.9: resetAllLocalData handles empty/dummy storage object without throwing');

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`STRESS TEST COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalStressTests().catch(err => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});

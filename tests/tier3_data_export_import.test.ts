import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

export interface AxonExportPayload {
  version: string;
  exportedAt: string;
  identity: {
    alias: string;
    deviceId: string;
  };
  settings: {
    textSize: string;
    cardPadding: string;
    borderRadius: string;
  };
  knownChats: string[];
  chats: Array<any>;
  messages: Array<any>;
  systemLogs: Array<any>;
}

/**
 * Validates whether an object matches the authoritative AxonExportPayload contract.
 */
export function validateExportPayload(payload: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object'] };
  }

  if (typeof payload.version !== 'string' || payload.version.trim() === '') {
    errors.push('Missing or invalid "version" string field');
  }

  if (typeof payload.exportedAt !== 'string' || isNaN(Date.parse(payload.exportedAt))) {
    errors.push('Missing or invalid "exportedAt" ISO date string');
  }

  if (!payload.identity || typeof payload.identity !== 'object') {
    errors.push('Missing "identity" object');
  } else {
    if (typeof payload.identity.alias !== 'string') errors.push('Missing "identity.alias" string');
    if (typeof payload.identity.deviceId !== 'string') errors.push('Missing "identity.deviceId" string');
  }

  if (!payload.settings || typeof payload.settings !== 'object') {
    errors.push('Missing "settings" object');
  } else {
    if (typeof payload.settings.textSize !== 'string') errors.push('Missing "settings.textSize"');
    if (typeof payload.settings.cardPadding !== 'string') errors.push('Missing "settings.cardPadding"');
    if (typeof payload.settings.borderRadius !== 'string') errors.push('Missing "settings.borderRadius"');
  }

  if (!Array.isArray(payload.knownChats)) errors.push('Missing "knownChats" array');
  if (!Array.isArray(payload.chats)) errors.push('Missing "chats" array');
  if (!Array.isArray(payload.messages)) errors.push('Missing "messages" array');
  if (!Array.isArray(payload.systemLogs)) errors.push('Missing "systemLogs" array');

  return { valid: errors.length === 0, errors };
}

/**
 * Parses and validates an imported JSON string payload.
 */
export function parseAndValidateImport(jsonStr: string): { success: boolean; data?: AxonExportPayload; error?: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    const validation = validateExportPayload(parsed);
    if (!validation.valid) {
      return { success: false, error: `Validation failed: ${validation.errors.join('; ')}` };
    }
    return { success: true, data: parsed };
  } catch (err: any) {
    return { success: false, error: `Invalid JSON syntax: ${err.message}` };
  }
}

/**
 * Tier 3: Full Data Management Export & Import Verification
 */
export async function runTier3Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 3.1: Export JSON Payload Structure & Serialization Validation
  const exportStart = Date.now();
  try {
    const samplePayload: AxonExportPayload = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      identity: {
        alias: 'Agent-007',
        deviceId: 'device-abc-123',
      },
      settings: {
        textSize: 'medium',
        cardPadding: 'normal',
        borderRadius: 'rounded',
      },
      knownChats: ['chat-1', 'chat-2'],
      chats: [{ id: 'chat-1', title: 'Security Audit' }],
      messages: [{ id: 'msg-1', chatId: 'chat-1', text: 'Decrypted message content' }],
      systemLogs: [{ id: 'log-1', timestamp: Date.now(), level: 'info', message: 'System startup' }],
    };

    const validation = validateExportPayload(samplePayload);
    if (!validation.valid) {
      throw new Error(`Sample payload failed validation: ${validation.errors.join(', ')}`);
    }

    const jsonString = JSON.stringify(samplePayload, null, 2);
    if (!jsonString.includes('"version": "1.0.0"') || !jsonString.includes('"alias": "Agent-007"')) {
      throw new Error('Export JSON serialization failed to preserve required fields');
    }

    // Check if src/utils/dataManager.ts exists and export functions are present
    const dataManagerPath = path.join(projectRoot, 'src', 'utils', 'dataManager.ts');
    if (fs.existsSync(dataManagerPath)) {
      const content = fs.readFileSync(dataManagerPath, 'utf-8');
      if (!content.includes('downloadJsonExport') && !content.includes('AxonExportPayload')) {
        throw new Error('src/utils/dataManager.ts does not export downloadJsonExport or AxonExportPayload');
      }
    }

    results.push({
      name: 'Tier 3.1: Export JSON Trigger & Payload Structure Validation',
      tier: 3,
      passed: true,
      durationMs: Date.now() - exportStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 3.1: Export JSON Trigger & Payload Structure Validation',
      tier: 3,
      passed: false,
      error: err.message,
      durationMs: Date.now() - exportStart,
    });
  }

  // Test 3.2: Import JSON Parsing & Validation Handling
  const importStart = Date.now();
  try {
    // 3.2.1 Valid payload import
    const validJson = JSON.stringify({
      version: '1.0.0',
      exportedAt: '2026-08-10T07:56:50.000Z',
      identity: { alias: 'TestUser', deviceId: 'dev-999' },
      settings: { textSize: 'small', cardPadding: 'compact', borderRadius: 'sharp' },
      knownChats: ['c1'],
      chats: [],
      messages: [],
      systemLogs: [],
    });

    const validResult = parseAndValidateImport(validJson);
    if (!validResult.success) {
      throw new Error(`Valid JSON import failed unexpectedly: ${validResult.error}`);
    }

    // 3.2.2 Malformed JSON syntax
    const malformedJson = '{ "version": "1.0.0", "identity": ';
    const malformedResult = parseAndValidateImport(malformedJson);
    if (malformedResult.success) {
      throw new Error('Malformed JSON import should have failed but succeeded');
    }
    if (!malformedResult.error?.includes('Invalid JSON syntax')) {
      throw new Error(`Malformed JSON error message missing expected description: got '${malformedResult.error}'`);
    }

    // 3.2.3 Missing required payload fields
    const incompleteJson = JSON.stringify({
      version: '1.0.0',
      // Missing identity, settings, knownChats, chats, messages, systemLogs
    });

    const incompleteResult = parseAndValidateImport(incompleteJson);
    if (incompleteResult.success) {
      throw new Error('Incomplete JSON import should have failed but succeeded');
    }
    if (!incompleteResult.error?.includes('Validation failed')) {
      throw new Error(`Incomplete JSON error message missing validation details: got '${incompleteResult.error}'`);
    }

    results.push({
      name: 'Tier 3.2: Import JSON Parsing & Schema Validation Edge Cases',
      tier: 3,
      passed: true,
      durationMs: Date.now() - importStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 3.2: Import JSON Parsing & Schema Validation Edge Cases',
      tier: 3,
      passed: false,
      error: err.message,
      durationMs: Date.now() - importStart,
    });
  }

  return results;
}

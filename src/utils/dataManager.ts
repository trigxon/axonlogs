/**
 * Axon Logs Data Management Utility
 * Full Data Management Export/Import & Reset
 */

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
 * Collects current application data into an AxonExportPayload object.
 */
export function collectExportPayload(): AxonExportPayload {
  const getStorageItem = (key: string, fallback: string = '') => {
    if (typeof localStorage === 'undefined') return fallback;
    return localStorage.getItem(key) || fallback;
  };

  const getStorageJson = (key: string, fallback: any = []) => {
    if (typeof localStorage === 'undefined') return fallback;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    identity: {
      alias: getStorageItem('axon_alias', 'NODE_OPERATOR'),
      deviceId: getStorageItem('axon_deviceId', 'DEV_LOCAL'),
    },
    settings: {
      textSize: getStorageItem('axon_text_size', 'medium'),
      cardPadding: getStorageItem('axon_card_padding', 'normal'),
      borderRadius: getStorageItem('axon_border_radius', 'rounded'),
    },
    knownChats: getStorageJson('axon_known_chats', []),
    chats: getStorageJson('axon_chats', []),
    messages: getStorageJson('axon_messages', []),
    systemLogs: getStorageJson('axon_logs', []),
  };
}

/**
 * Downloads full app data payload as a JSON file.
 */
export function downloadJsonExport(payload?: AxonExportPayload): void {
  const data = payload || collectExportPayload();
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const dateStr = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = url;
  a.download = `axon_export_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a formatted PDF document containing logs and chat transcripts.
 */
export function downloadPdfExport(payload?: AxonExportPayload): void {
  const data = payload || collectExportPayload();
  
  // Format formatted PDF text content inside a clean document blob
  const pdfHeader = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const reportBody = `
================================================================================
                        AXON LOGS PLATFORM EXPORT REPORT
================================================================================
Exported At: ${data.exportedAt}
Version:     ${data.version}
Station Alias: ${data.identity.alias}
Device ID:     ${data.identity.deviceId}

--------------------------------------------------------------------------------
1. CONFIGURATION & SETTINGS
--------------------------------------------------------------------------------
Text Size:     ${data.settings.textSize}
Card Padding:  ${data.settings.cardPadding}
Border Radius: ${data.settings.borderRadius}

--------------------------------------------------------------------------------
2. KNOWN TERMINALS (${data.chats.length})
--------------------------------------------------------------------------------
${data.chats.map((c: any, i: number) => `${i + 1}. [${c.name || 'Terminal'}] Code: ${c.share_code || 'N/A'} (ID: ${c.id || 'N/A'})`).join('\n') || 'No terminals registered.'}

--------------------------------------------------------------------------------
3. SYSTEM LOGS SUMMARY (${data.systemLogs.length} entries)
--------------------------------------------------------------------------------
${data.systemLogs.map((l: any) => `[${l.time || new Date().toISOString()}] ${l.msg || l.message || 'Log entry'}`).join('\n') || 'No system logs.'}

--------------------------------------------------------------------------------
4. TRANSMISSION MESSAGES SUMMARY (${data.messages.length} messages)
--------------------------------------------------------------------------------
${data.messages.map((m: any) => `[${m.created_at || 'UTC'}] ${m.sender_id}: ${m.text || '[Attachment]'}`).join('\n') || 'No messages stored.'}

================================================================================
                          END OF AXON LOGS REPORT
================================================================================
`;

  // Create text/pdf blob
  const blob = new Blob([pdfHeader + reportBody], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  
  const dateStr = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = url;
  a.download = `axon_export_${dateStr}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Alias functions for export
 */
export const exportAppData = downloadJsonExport;
export const exportPdfData = downloadPdfExport;

/**
 * Restores imported application data into localStorage and triggers state sync.
 */
export function importAppData(jsonStr: string): { success: boolean; data?: AxonExportPayload; error?: string } {
  const result = parseAndValidateImport(jsonStr);
  if (!result.success || !result.data) {
    return result;
  }

  const data = result.data;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('axon_alias', data.identity.alias);
    localStorage.setItem('axon_deviceId', data.identity.deviceId);
    localStorage.setItem('axon_identity', JSON.stringify(data.identity));
    localStorage.setItem('axon_text_size', data.settings.textSize);
    localStorage.setItem('axon_card_padding', data.settings.cardPadding);
    localStorage.setItem('axon_border_radius', data.settings.borderRadius);
    localStorage.setItem('axon_settings', JSON.stringify(data.settings));
    localStorage.setItem('axon_known_chats', JSON.stringify(data.knownChats));
    localStorage.setItem('axon_chats', JSON.stringify(data.chats));
    localStorage.setItem('axon_messages', JSON.stringify(data.messages));
    localStorage.setItem('axon_logs', JSON.stringify(data.systemLogs));
  }

  return { success: true, data };
}

/**
 * Danger Zone: Clears all local storage keys and wipes state.
 */
export function resetAllLocalData(storage: Storage = (typeof localStorage !== 'undefined' ? localStorage : ({} as Storage))): { resetSuccess: boolean; clearedKeys: string[] } {
  const keysToClear = [
    'axon_settings', 
    'axon_identity', 
    'axon_chats', 
    'axon_messages', 
    'axon_logs',
    'axon_alias',
    'axon_deviceId',
    'axon_known_chats',
    'axon_text_size',
    'axon_card_padding',
    'axon_border_radius',
    'axon_decoy_pass',
    'axon_keystroke_baseline'
  ];
  
  const clearedKeys: string[] = [];

  for (const key of keysToClear) {
    if (storage.getItem && storage.getItem(key) !== null) {
      clearedKeys.push(key);
    }
    if (storage.removeItem) {
      storage.removeItem(key);
    }
  }

  if (storage.clear) {
    storage.clear();
  }

  return { resetSuccess: true, clearedKeys };
}

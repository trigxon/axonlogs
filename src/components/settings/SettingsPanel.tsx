import React, { useState, useRef } from 'react';
import { 
  Settings, 
  Type, 
  Download, 
  Upload, 
  FileText, 
  AlertTriangle, 
  ShieldAlert, 
  ToggleRight, 
  ToggleLeft,
  UserCheck,
  Check,
  X
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useCrypto } from '../../contexts/CryptoContext';
import { 
  exportAppData, 
  exportPdfData, 
  importAppData, 
  resetAllLocalData 
} from '../../utils/dataManager';

export const SettingsPanel: React.FC = () => {
  const { textSize, cardPadding, borderRadius, setTextSize, setCardPadding, setBorderRadius } = useTheme();
  const { alias, deviceId, updateAlias, addLog } = useCrypto();

  const [aliasInput, setAliasInput] = useState(alias);
  const [stealthMode, setStealthMode] = useState(false);
  const [decoyPassphrase, setDecoyPassphrase] = useState(() => localStorage.getItem('axon_decoy_pass') || 'DECOY123');
  
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleAliasSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aliasInput.trim()) return;
    updateAlias(aliasInput.trim());
    showStatus('success', `STATION ALIAS UPDATED TO [${aliasInput.trim().toUpperCase()}]`);
  };

  const handleExportJson = () => {
    try {
      exportAppData();
      addLog('Exported JSON data archive.');
      showStatus('success', 'JSON EXPORT DOWNLOAD INITIATED SUCCESSFULLY');
    } catch (err: any) {
      showStatus('error', `EXPORT FAILED: ${err.message}`);
    }
  };

  const handleExportPdf = () => {
    try {
      exportPdfData();
      addLog('Exported PDF log report.');
      showStatus('success', 'PDF EXPORT DOWNLOAD INITIATED SUCCESSFULLY');
    } catch (err: any) {
      showStatus('error', `PDF EXPORT FAILED: ${err.message}`);
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const result = importAppData(content);
      if (result.success) {
        addLog('Imported JSON data backup.');
        showStatus('success', 'DATA IMPORT SUCCESSFUL! RELOADING STATE...');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        showStatus('error', `IMPORT ERROR: ${result.error}`);
      }
    };
    reader.onerror = () => {
      showStatus('error', 'FAILED TO READ IMPORT FILE');
    };
    reader.readAsText(file);

    // Reset file input value
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmReset = () => {
    try {
      resetAllLocalData();
      showStatus('success', 'DANGER ZONE: ALL LOCAL DATA CLEARED. RESETTING...');
      setShowResetModal(false);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      showStatus('error', `RESET FAILED: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-[#a3a3a3] font-mono overflow-y-auto p-6 space-y-6">
      {/* HEADER BAR */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-widest text-pink-400 uppercase">
              SYSTEM CONFIGURATION & SETTINGS
            </h1>
            <p className="text-xs text-zinc-500">
              Appearance scaling, identity management, data export/import, and danger zone controls
            </p>
          </div>
        </div>

        {statusMessage && (
          <div className={`px-4 py-2 text-xs font-bold rounded border flex items-center gap-2 animate-fade-in ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-red-500/10 border-red-500/40 text-red-400'
          }`}>
            {statusMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {statusMessage.text}
          </div>
        )}
      </div>

      {/* SECTION 1: STATION ALIAS & IDENTITY */}
      <div className="border-l-4 border-l-pink-500 bg-[#0a0a0f] p-5 border border-zinc-800/80 rounded ui-card space-y-4">
        <div className="flex items-center gap-2 text-pink-500 font-bold tracking-widest text-sm uppercase">
          <UserCheck className="w-4 h-4" />
          STATION ALIAS & IDENTITY
        </div>
        <form onSubmit={handleAliasSave} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 tracking-widest uppercase mb-1">STATION ALIAS</label>
            <input 
              type="text" 
              value={aliasInput}
              onChange={e => setAliasInput(e.target.value)}
              placeholder="e.g. OPERATOR_ALPHA"
              className="w-full max-w-md bg-[#050505] border border-zinc-800 focus:border-pink-500 p-2.5 text-white font-mono text-sm outline-none uppercase rounded ui-input transition-colors"
            />
          </div>
          <button 
            type="submit"
            className="bg-pink-500 hover:bg-pink-400 text-black py-2 px-5 text-xs font-bold tracking-widest uppercase transition-colors rounded cursor-pointer"
          >
            UPDATE ALIAS
          </button>
        </form>
      </div>

      {/* SECTION 2: DYNAMIC UI APPEARANCE (M4) */}
      <div className="border-l-4 border-l-cyan-500 bg-[#0a0a0f] p-5 border border-zinc-800/80 rounded ui-card space-y-5">
        <div className="flex items-center gap-2 text-cyan-400 font-bold tracking-widest text-sm uppercase">
          <Type className="w-4 h-4" />
          DYNAMIC UI APPEARANCE (R3)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* UI TEXT SIZE */}
          <div className="space-y-2">
            <label className="block text-xs text-zinc-400 tracking-widest uppercase flex items-center justify-between">
              <span>Text Size</span>
              <span className="text-cyan-400 font-bold">({textSize})</span>
            </label>
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setTextSize(size)}
                  className={`flex-1 py-2 px-3 rounded text-xs font-mono uppercase tracking-wider transition-all border cursor-pointer ${
                    textSize === size
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-400 font-bold shadow-sm shadow-cyan-950/40'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500">
              Small: 12px | Medium: 14px | Large: 16px
            </p>
          </div>

          {/* CARD PADDING */}
          <div className="space-y-2">
            <label className="block text-xs text-zinc-400 tracking-widest uppercase flex items-center justify-between">
              <span>Card Padding</span>
              <span className="text-cyan-400 font-bold">({cardPadding})</span>
            </label>
            <div className="flex gap-2">
              {(['compact', 'normal', 'relaxed'] as const).map((pad) => (
                <button
                  key={pad}
                  type="button"
                  onClick={() => setCardPadding(pad)}
                  className={`flex-1 py-2 px-3 rounded text-xs font-mono uppercase tracking-wider transition-all border cursor-pointer ${
                    cardPadding === pad
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-400 font-bold shadow-sm shadow-cyan-950/40'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {pad}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500">
              Compact: 8px | Normal: 16px | Relaxed: 24px
            </p>
          </div>

          {/* BORDER RADIUS */}
          <div className="space-y-2">
            <label className="block text-xs text-zinc-400 tracking-widest uppercase flex items-center justify-between">
              <span>Border Radius</span>
              <span className="text-cyan-400 font-bold">({borderRadius})</span>
            </label>
            <div className="flex gap-2">
              {(['sharp', 'rounded', 'pill'] as const).map((rad) => (
                <button
                  key={rad}
                  type="button"
                  onClick={() => setBorderRadius(rad)}
                  className={`flex-1 py-2 px-3 rounded text-xs font-mono uppercase tracking-wider transition-all border cursor-pointer ${
                    borderRadius === rad
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-400 font-bold shadow-sm shadow-cyan-950/40'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {rad}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500">
              Sharp: 0px | Rounded: 8px | Pill: 24px
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 3: PRIVACY & THREAT MITIGATION */}
      <div className="border-l-4 border-l-blue-500 bg-[#0a0a0f] p-5 border border-zinc-800/80 rounded ui-card space-y-4">
        <div className="text-blue-500 font-bold tracking-widest text-sm uppercase">
          PRIVACY & THREAT MITIGATION
        </div>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <button 
              type="button" 
              onClick={() => setStealthMode(!stealthMode)}
              className="text-zinc-500 hover:text-blue-400 transition-colors"
            >
              {stealthMode ? <ToggleRight className="text-blue-400 w-6 h-6" /> : <ToggleLeft className="text-zinc-600 w-6 h-6" />}
            </button>
            <span className="text-xs text-zinc-300">Stealth Mode (Blur terminal feed on idle/hover)</span>
          </label>

          <div>
            <label className="block text-xs text-zinc-400 tracking-widest uppercase mb-1">DECOY VAULT PASSPHRASE</label>
            <input 
              type="text" 
              value={decoyPassphrase}
              onChange={e => {
                setDecoyPassphrase(e.target.value); 
                localStorage.setItem('axon_decoy_pass', e.target.value);
              }}
              className="w-full max-w-md bg-[#050505] border border-zinc-800 focus:border-blue-500 p-2.5 text-white font-mono text-sm outline-none uppercase rounded ui-input transition-colors"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Entering this passphrase during unlock will trigger plausible deniability decoy mode.</p>
          </div>
        </div>
      </div>

      {/* SECTION 4: FULL DATA MANAGEMENT (M5) */}
      <div className="border-l-4 border-l-emerald-500 bg-[#0a0a0f] p-5 border border-zinc-800/80 rounded ui-card space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-bold tracking-widest text-sm uppercase">
          <Download className="w-4 h-4" />
          FULL DATA MANAGEMENT (R4)
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Export all decrypted chat messages, configuration settings, known terminal links, and system logs to JSON or PDF format. Import standard JSON archives to restore full application state.
        </p>

        <div className="flex flex-wrap gap-4 pt-2">
          {/* EXPORT JSON BUTTON */}
          <button
            type="button"
            onClick={handleExportJson}
            className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/40 hover:bg-emerald-500 hover:text-black text-emerald-400 py-2.5 px-5 text-xs font-bold tracking-widest uppercase transition-all rounded cursor-pointer"
          >
            <Download className="w-4 h-4" />
            EXPORT JSON DATA
          </button>

          {/* EXPORT PDF BUTTON */}
          <button
            type="button"
            onClick={handleExportPdf}
            className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/40 hover:bg-cyan-500 hover:text-black text-cyan-400 py-2.5 px-5 text-xs font-bold tracking-widest uppercase transition-all rounded cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            EXPORT PDF LOGS
          </button>

          {/* IMPORT JSON INPUT */}
          <input
            type="file"
            accept=".json,application/json"
            ref={fileInputRef}
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/40 hover:bg-purple-500 hover:text-black text-purple-400 py-2.5 px-5 text-xs font-bold tracking-widest uppercase transition-all rounded cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            IMPORT JSON BACKUP
          </button>
        </div>
      </div>

      {/* SECTION 5: SYSTEM CONTROL & DEVICE WATERMARK */}
      <div className="border-l-4 border-l-purple-500 bg-[#0a0a0f] p-5 border border-zinc-800/80 rounded ui-card space-y-3">
        <div className="text-purple-400 font-bold tracking-widest text-sm uppercase">
          SYSTEM CONTROL & DEVICE IDENTIFIER
        </div>
        <div>
          <label className="block text-xs text-zinc-400 tracking-widest uppercase mb-1">DEVICE IDENTIFIER (WATERMARK ID)</label>
          <div className="w-full max-w-md bg-[#050505] border border-zinc-800 p-2.5 text-zinc-400 font-mono text-xs select-all rounded">
            {deviceId || 'DEV_UNKNOWN'}
          </div>
        </div>
      </div>

      {/* SECTION 6: DANGER ZONE (RESET ALL LOCAL DATA) */}
      <div className="border-l-4 border-l-red-500 bg-[#0a0a0f] p-5 border border-zinc-800/80 rounded ui-card space-y-4">
        <div className="flex items-center gap-2 text-red-500 font-bold tracking-widest text-sm uppercase">
          <ShieldAlert className="w-4 h-4" />
          DANGER ZONE
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Executing a Danger Zone Reset will permanently wipe all local storage data (`axon_*` keys), decrypted chats, custom settings, and terminal identifiers, restoring Axon Logs to a pristine clean state.
        </p>

        <button
          type="button"
          onClick={() => setShowResetModal(true)}
          className="bg-red-500/10 border border-red-500/50 hover:bg-red-500 hover:text-black text-red-500 py-2.5 px-5 text-xs font-bold tracking-widest uppercase transition-all rounded cursor-pointer"
        >
          RESET ALL LOCAL DATA
        </button>
      </div>

      {/* DANGER ZONE CONFIRMATION MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#08080c] border border-red-500/60 w-full max-w-md p-6 rounded shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowResetModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-red-500">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold tracking-widest uppercase">
                CONFIRM DANGER ZONE RESET
              </h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you completely sure? This action will permanently erase all local application state, custom preferences, active encryption keys, and terminal channels.
            </p>

            <div className="p-3 bg-red-950/30 border border-red-500/30 rounded text-[11px] text-red-400 font-mono">
              [WARNING]: Action is irreversible.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold tracking-widest uppercase rounded cursor-pointer transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-2 bg-red-500 hover:bg-red-400 text-black text-xs font-bold tracking-widest uppercase rounded cursor-pointer transition-colors"
              >
                CONFIRM & WIPE ALL DATA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;

import React, { useState, useRef } from 'react';
import { 
  Settings, 
  Download, 
  Upload, 
  AlertTriangle, 
  ShieldAlert, 
  ToggleRight, 
  ToggleLeft,
  UserCheck,
  Check,
  X,
  ChevronRight,
  Monitor
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

  // Reusable Layout Components
  const SectionHeader = ({ icon: Icon, title, color = "text-zinc-500" }: { icon: any, title: string, color?: string }) => (
    <div className={`flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase mb-2 px-1 ${color}`}>
      <Icon className="w-3.5 h-3.5" /> {title}
    </div>
  );

  const SectionCard = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-[#0a0a0f] border border-zinc-800/80 rounded-xl overflow-hidden mb-6 shadow-sm">
      {children}
    </div>
  );

  const SettingRow = ({ title, desc, children, isButton = false, onClick }: { title: string, desc: string, children?: React.ReactNode, isButton?: boolean, onClick?: () => void }) => {
    const Comp = isButton ? 'button' : 'div';
    return (
      <Comp 
        onClick={onClick}
        className={`w-full flex items-center justify-between p-4 border-b border-zinc-800/50 last:border-0 ${isButton ? 'hover:bg-zinc-800/30 transition-colors text-left cursor-pointer' : ''}`}
      >
        <div className="pr-4 max-w-[60%]">
          <div className="text-sm font-semibold text-zinc-200 tracking-wide">{title}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed uppercase tracking-wider">{desc}</div>
        </div>
        <div className="shrink-0 flex items-center justify-end">
          {children}
        </div>
      </Comp>
    );
  };

  const SegmentedControl = ({ options, current, onChange }: { options: string[], current: string, onChange: (val: any) => void }) => (
    <div className="flex bg-[#050505] border border-zinc-800/80 rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest uppercase transition-colors ${
            current === opt 
              ? 'bg-cyan-500/20 text-cyan-400' 
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-[#a3a3a3] font-mono overflow-y-auto">
      
      {/* Header Sticky Bar */}
      <div className="sticky top-0 z-10 bg-[#050505]/95 backdrop-blur border-b border-zinc-800 p-6 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-[0.2em] text-zinc-100 uppercase flex items-center gap-3">
            <Settings className="w-5 h-5 text-cyan-400" /> SYSTEM PREFERENCES
          </h1>
        </div>
        {statusMessage && (
          <div className={`px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded border flex items-center gap-2 animate-fade-in ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-red-500/10 border-red-500/40 text-red-400'
          }`}>
            {statusMessage.type === 'success' ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            {statusMessage.text}
          </div>
        )}
      </div>

      <div className="p-6 max-w-4xl space-y-2">
        
        {/* IDENTITY */}
        <div>
          <SectionHeader icon={UserCheck} title="Identity & Profile" color="text-cyan-500" />
          <SectionCard>
            <SettingRow title="Station Alias" desc="Operator handle for identity masking">
              <form onSubmit={handleAliasSave} className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={aliasInput}
                  onChange={e => setAliasInput(e.target.value)}
                  placeholder="OPERATOR_ALPHA"
                  className="bg-[#050505] border border-zinc-800 focus:border-cyan-500 px-3 py-1.5 text-cyan-400 font-mono text-xs outline-none uppercase rounded-md text-right w-40 transition-colors"
                />
                <button type="submit" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-1.5 rounded-md transition-colors">
                  <Check className="w-4 h-4" />
                </button>
              </form>
            </SettingRow>
            <SettingRow title="Device Identifier" desc="Unique watermark ID for current node">
              <div className="bg-[#050505] border border-zinc-800 px-3 py-1.5 text-zinc-500 font-mono text-[10px] rounded-md select-all">
                {deviceId || 'DEV_UNKNOWN'}
              </div>
            </SettingRow>
          </SectionCard>
        </div>

        {/* SECURITY & PRIVACY */}
        <div>
          <SectionHeader icon={ShieldAlert} title="Privacy & Mitigation" color="text-blue-500" />
          <SectionCard>
            <SettingRow title="Stealth Mode" desc="Blur terminal feed on idle/hover state">
              <button onClick={() => setStealthMode(!stealthMode)}>
                {stealthMode ? <ToggleRight className="text-blue-400 w-8 h-8" /> : <ToggleLeft className="text-zinc-700 w-8 h-8" />}
              </button>
            </SettingRow>
            <SettingRow title="Decoy Vault Passphrase" desc="Trigger plausible deniability mode on unlock">
              <input 
                type="text" 
                value={decoyPassphrase}
                onChange={e => {
                  setDecoyPassphrase(e.target.value); 
                  localStorage.setItem('axon_decoy_pass', e.target.value);
                }}
                className="bg-[#050505] border border-zinc-800 focus:border-blue-500 px-3 py-1.5 text-blue-400 font-mono text-xs outline-none uppercase rounded-md text-right w-48 transition-colors"
              />
            </SettingRow>
          </SectionCard>
        </div>

        {/* UI CUSTOMIZATION */}
        <div>
          <SectionHeader icon={Monitor} title="Interface Styling" />
          <SectionCard>
            <SettingRow title="UI Text Size" desc="Scale interface font elements">
              <SegmentedControl options={['small', 'medium', 'large']} current={textSize} onChange={setTextSize} />
            </SettingRow>
            <SettingRow title="Card Padding" desc="Adjust spacing inside containers">
              <SegmentedControl options={['compact', 'normal', 'relaxed']} current={cardPadding} onChange={setCardPadding} />
            </SettingRow>
            <SettingRow title="Border Radius" desc="Shape of buttons and modules">
              <SegmentedControl options={['sharp', 'rounded', 'pill']} current={borderRadius} onChange={setBorderRadius} />
            </SettingRow>
          </SectionCard>
        </div>

        {/* DATA EXPORT */}
        <div>
          <SectionHeader icon={Download} title="Data Export" color="text-emerald-500" />
          <SectionCard>
            <SettingRow title="Export PDF Report" desc="Download complete performance logs as PDF" isButton onClick={handleExportPdf}>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </SettingRow>
            <SettingRow title="Export JSON Backup" desc="Download local storage dump as JSON archive" isButton onClick={handleExportJson}>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </SettingRow>
          </SectionCard>
        </div>

        {/* DATA IMPORT */}
        <div>
          <SectionHeader icon={Upload} title="Data Import" color="text-purple-500" />
          <SectionCard>
            <SettingRow title="Import JSON Backup" desc="Restore data from a JSON archive" isButton onClick={() => fileInputRef.current?.click()}>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </SettingRow>
            <input type="file" accept=".json,application/json" ref={fileInputRef} onChange={handleImportJson} className="hidden" />
          </SectionCard>
        </div>

        {/* DANGER ZONE */}
        <div>
          <SectionHeader icon={AlertTriangle} title="Danger Zone" color="text-red-500" />
          <SectionCard>
            <SettingRow title="Reset All Data" desc="Permanently wipe all logs and custom settings" isButton onClick={() => setShowResetModal(true)}>
              <ChevronRight className="w-4 h-4 text-red-500/50 group-hover:text-red-500" />
            </SettingRow>
          </SectionCard>
        </div>

      </div>

      {/* DANGER ZONE MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#08080c] border border-red-500/60 w-full max-w-md p-6 rounded-xl shadow-2xl relative space-y-4">
            <button onClick={() => setShowResetModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
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

            <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-lg text-[10px] text-red-400 font-mono tracking-widest">
              [WARNING]: Action is irreversible.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowResetModal(false)} className="px-4 py-2 text-zinc-300 hover:text-white text-[10px] font-bold tracking-widest uppercase rounded-lg transition-colors">
                CANCEL
              </button>
              <button onClick={handleConfirmReset} className="px-4 py-2 bg-red-500 hover:bg-red-400 text-black text-[10px] font-bold tracking-widest uppercase rounded-lg transition-colors">
                CONFIRM & WIPE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;

import React from 'react';
import { X, Moon, Monitor, EyeOff, Download, Trash2, Edit3 } from 'lucide-react';
import { useSettings, type FontSize, type CornerStyle } from '../../contexts/SettingsContext';
import { useCrypto } from '../../contexts/CryptoContext';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  close: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, close }) => {
  const { 
    isDarkMode, setIsDarkMode, 
    fontSize, setFontSize, 
    cornerStyle, setCornerStyle,
    burnerMode, setBurnerMode
  } = useSettings();

  const { messages, activeChat } = useCrypto();

  const handleExportJSON = () => {
    if (!activeChat) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(messages, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `axon_chat_${activeChat.name.replace(/\s+/g, '_')}.json`);
    dlAnchorElem.click();
  };

  const handleDeleteData = () => {
    if (confirm("Are you sure you want to delete all local session data? This will log you out.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={close}
          />
          
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="relative w-full max-w-2xl bg-background rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            style={{ borderRadius: 'var(--radius)' }}
          >
            <div className="p-5 border-b border-border flex justify-between items-center bg-panel shrink-0">
              <h2 className="font-semibold text-lg">Settings</h2>
              <button onClick={close} className="p-1.5 hover:bg-white/10 rounded-lg text-text-secondary hover:text-text-primary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* APPEARANCE SECTION */}
              <div className="bg-panel border border-border overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
                <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-border text-xs font-semibold tracking-wider text-text-secondary uppercase border-l-[3px] border-l-[#d946ef]">
                  <Edit3 className="w-4 h-4" /> Appearance
                </div>
                
                <div className="p-4 space-y-4">
                  {/* Theme */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-text-primary">Theme Mode</div>
                      <div className="text-sm text-text-secondary">Toggle dark or light aesthetics.</div>
                    </div>
                    <div className="flex bg-background border border-border p-1 rounded-lg">
                      <button 
                        onClick={() => setIsDarkMode(true)} 
                        className={cn("px-4 py-1.5 text-sm rounded flex items-center gap-2 transition-colors", isDarkMode ? "bg-panel shadow text-text-primary" : "text-text-secondary hover:text-text-primary")}
                      >
                        <Moon className="w-4 h-4" /> Dark
                      </button>
                      <button 
                        onClick={() => setIsDarkMode(false)} 
                        className={cn("px-4 py-1.5 text-sm rounded flex items-center gap-2 transition-colors", !isDarkMode ? "bg-panel shadow text-text-primary" : "text-text-secondary hover:text-text-primary")}
                      >
                        <Monitor className="w-4 h-4" /> Light
                      </button>
                    </div>
                  </div>

                  <hr className="border-border" />

                  {/* Font Size */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-text-primary">UI Text Size</div>
                      <div className="text-sm text-text-secondary">Affects labels and body text.</div>
                    </div>
                    <div className="flex bg-background border border-border p-1 rounded-lg">
                      {(['S', 'M', 'L'] as FontSize[]).map(size => (
                        <button 
                          key={size}
                          onClick={() => setFontSize(size)} 
                          className={cn(
                            "w-10 py-1.5 text-sm rounded font-medium transition-colors", 
                            fontSize === size ? "bg-panel shadow text-text-primary" : "text-text-secondary hover:text-text-primary"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  <hr className="border-border" />

                  {/* Corner Style */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-text-primary">Border Radius</div>
                      <div className="text-sm text-text-secondary">How rounded cards and buttons appear.</div>
                    </div>
                    <div className="flex bg-background border border-border p-1 rounded-lg">
                      {(['Sharp', 'Rounded', 'Pill'] as CornerStyle[]).map(style => (
                        <button 
                          key={style}
                          onClick={() => setCornerStyle(style)} 
                          className={cn(
                            "px-3 py-1.5 text-sm rounded font-medium transition-colors", 
                            cornerStyle === style ? "bg-panel shadow text-text-primary" : "text-text-secondary hover:text-text-primary"
                          )}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* PRIVACY SECTION */}
              <div className="bg-panel border border-border overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
                <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-border text-xs font-semibold tracking-wider text-text-secondary uppercase border-l-[3px] border-l-[#3b82f6]">
                  <EyeOff className="w-4 h-4" /> Privacy
                </div>
                <div className="p-4">
                  <div 
                    onClick={() => setBurnerMode(!burnerMode)}
                    className="flex items-center justify-between cursor-pointer group"
                  >
                    <div>
                      <div className="font-medium text-text-primary group-hover:text-accent transition-colors">Burner Mode</div>
                      <div className="text-sm text-text-secondary">Messages are deleted from the database on read.</div>
                    </div>
                    <div className={cn("w-11 h-6 rounded-full p-1 transition-colors relative shrink-0", burnerMode ? "bg-accent" : "bg-border")}>
                      <div className={cn("w-4 h-4 bg-white rounded-full shadow transition-transform", burnerMode ? "translate-x-5" : "translate-x-0")} />
                    </div>
                  </div>
                </div>
              </div>

              {/* DATA SECTION */}
              <div className="bg-panel border border-border overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
                <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-border text-xs font-semibold tracking-wider text-text-secondary uppercase border-l-[3px] border-l-[#10b981]">
                  <Download className="w-4 h-4" /> Export
                </div>
                <div className="p-0">
                  <div 
                    onClick={handleExportJSON}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-text-primary">Export JSON Backup</div>
                      <div className="text-sm text-text-secondary">Download all your chat data as a portable file.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* DANGER ZONE */}
              <div className="bg-panel border border-border overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
                <div className="flex items-center gap-2 px-4 py-3 bg-danger/10 border-b border-danger/20 text-xs font-semibold tracking-wider text-danger uppercase border-l-[3px] border-l-danger">
                  <Trash2 className="w-4 h-4" /> Danger Zone
                </div>
                <div className="p-0">
                  <div 
                    onClick={handleDeleteData}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-danger/10 transition-colors group"
                  >
                    <div>
                      <div className="font-medium text-danger">Reset All Data</div>
                      <div className="text-sm text-text-secondary group-hover:text-danger/70 transition-colors">Permanently delete your local workspace data.</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;

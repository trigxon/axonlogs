import React from 'react';
import { X, EyeOff, Trash2, Terminal, Monitor, Sparkles } from 'lucide-react';
import { useSettings, type AppTheme } from '../../contexts/SettingsContext';
import { motion, AnimatePresence } from 'framer-motion';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { 
    appTheme, setAppTheme,
    stealthMode, setStealthMode,
    burnerMode, setBurnerMode
  } = useSettings();

  const handleReset = () => {
    if (confirm('WARNING: This will wipe all local keys and disconnect you from all tunnels. Proceed?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="relative w-full max-w-lg bg-panel border border-border shadow-2xl overflow-hidden font-mono"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-background">
              <h2 className="text-lg font-bold text-white">// SYSTEM_CONFIG</h2>
              <button onClick={onClose} className="p-1 text-text-secondary hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-8 max-h-[80vh] overflow-y-auto">
              
              {/* THEME SELECTOR */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-text-secondary tracking-widest">// THEME_ENGINE</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'Terminal', icon: Terminal, label: 'TERMINAL', desc: 'Classic matrix' },
                    { id: 'Cyberpunk', icon: Sparkles, label: 'CYBERPUNK', desc: 'Neon overdrive' },
                    { id: 'Minimalist', icon: Monitor, label: 'MINIMALIST', desc: 'Clean slate' }
                  ].map(theme => {
                    const isActive = appTheme === theme.id;
                    const Icon = theme.icon;
                    return (
                      <button
                        key={theme.id}
                        onClick={() => setAppTheme(theme.id as AppTheme)}
                        className={`p-3 border text-left transition-all flex flex-col gap-2 ${
                          isActive 
                            ? 'border-accent bg-accent/10 text-accent' 
                            : 'border-border bg-background hover:border-text-secondary/50 text-text-secondary'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <div>
                          <div className="text-sm font-bold">{theme.label}</div>
                          <div className="text-[10px] opacity-70 mt-0.5">{theme.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECURITY & PRIVACY */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-text-secondary tracking-widest">// SECURITY_PROTOCOLS</label>
                
                <div className="space-y-3">
                  {/* Stealth Mode */}
                  <div className="flex items-center justify-between p-4 bg-background border border-border">
                    <div>
                      <div className="text-sm font-bold text-white mb-1">Stealth Mode</div>
                      <div className="text-xs text-text-secondary">Obfuscate messages until hovered</div>
                    </div>
                    <button
                      onClick={() => setStealthMode(!stealthMode)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${stealthMode ? 'bg-accent' : 'bg-border'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${stealthMode ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Burn on Refresh */}
                  <div className="flex items-center justify-between p-4 bg-background border border-border">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-white mb-1">
                        <EyeOff className="w-4 h-4 text-accent" />
                        Burn on Refresh
                      </div>
                      <div className="text-xs text-text-secondary">Delete messages from DB instantly on read</div>
                    </div>
                    <button
                      onClick={() => setBurnerMode(!burnerMode)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${burnerMode ? 'bg-accent' : 'bg-border'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${burnerMode ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* DANGER ZONE */}
              <div className="space-y-3 pt-4 border-t border-border">
                <label className="block text-xs font-bold text-danger tracking-widest">// DANGER_ZONE</label>
                <button
                  onClick={handleReset}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 hover:border-danger transition-colors text-sm font-bold"
                >
                  <Trash2 className="w-4 h-4" />
                  INITIATE MASTER RESET
                </button>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;

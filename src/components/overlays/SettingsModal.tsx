import React from 'react';
import { X, EyeOff, Trash2, Moon, Sun } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { motion, AnimatePresence } from 'framer-motion';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { 
    isDarkMode, setIsDarkMode,
    stealthMode, setStealthMode,
    burnerMode, setBurnerMode
  } = useSettings();

  const handleReset = () => {
    if (confirm('WARNING: This will wipe all local keys and disconnect you from all chats. Proceed?')) {
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="relative w-full max-w-md bg-background border border-border shadow-xl overflow-hidden rounded-2xl"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">Settings</h2>
              <button onClick={onClose} className="p-2 text-text-secondary hover:bg-panel rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-8 max-h-[80vh] overflow-y-auto">
              
              {/* APPEARANCE */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider">Appearance</label>
                <div className="flex items-center justify-between p-4 bg-panel border border-border rounded-xl">
                  <div className="flex items-center gap-3 text-sm font-medium text-text-primary">
                    {isDarkMode ? <Moon className="w-5 h-5 text-accent" /> : <Sun className="w-5 h-5 text-accent" />}
                    Dark Mode
                  </div>
                  <button
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${isDarkMode ? 'bg-accent' : 'bg-border'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isDarkMode ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              {/* SECURITY & PRIVACY */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider">Privacy & Security</label>
                
                <div className="space-y-3">
                  {/* Stealth Mode */}
                  <div className="flex items-center justify-between p-4 bg-panel border border-border rounded-xl">
                    <div>
                      <div className="text-sm font-bold text-text-primary mb-1">Stealth Mode</div>
                      <div className="text-xs text-text-secondary">Blur messages until hovered</div>
                    </div>
                    <button
                      onClick={() => setStealthMode(!stealthMode)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${stealthMode ? 'bg-accent' : 'bg-border'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${stealthMode ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Burn on Refresh */}
                  <div className="flex items-center justify-between p-4 bg-panel border border-border rounded-xl">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-text-primary mb-1">
                        <EyeOff className="w-4 h-4 text-accent" />
                        Burn on Read
                      </div>
                      <div className="text-xs text-text-secondary">Delete messages from DB instantly on read</div>
                    </div>
                    <button
                      onClick={() => setBurnerMode(!burnerMode)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${burnerMode ? 'bg-accent' : 'bg-border'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${burnerMode ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* DANGER ZONE */}
              <div className="space-y-3 pt-4 border-t border-border">
                <button
                  onClick={handleReset}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-danger/10 hover:bg-danger/20 text-danger rounded-xl transition-colors text-sm font-bold"
                >
                  <Trash2 className="w-4 h-4" />
                  Reset Application
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

import React from 'react';
import { X, Moon, Sun, CornerDownLeft } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  close: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, close }) => {
  const { isDarkMode, setIsDarkMode, enterToSend, setEnterToSend } = useSettings();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={close}
          />
          
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-[90%] max-w-md bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-4 border-b border-border flex justify-between items-center bg-background/50">
              <h2 className="font-semibold text-lg">Settings</h2>
              <button onClick={close} className="p-1 hover:bg-white/10 rounded-lg text-text-secondary hover:text-text-primary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-2">
              <div 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-background border border-border rounded-lg">
                    {isDarkMode ? <Moon className="w-5 h-5 text-accent" /> : <Sun className="w-5 h-5 text-accent" />}
                  </div>
                  <div>
                    <div className="font-medium text-text-primary">Theme Mode</div>
                    <div className="text-xs text-text-secondary">Toggle dark or light aesthetics.</div>
                  </div>
                </div>
                <div className={cn("w-10 h-6 rounded-full p-1 transition-colors relative", isDarkMode ? "bg-accent" : "bg-border")}>
                  <div className={cn("w-4 h-4 bg-white rounded-full shadow transition-transform", isDarkMode ? "translate-x-4" : "translate-x-0")} />
                </div>
              </div>

              <div 
                onClick={() => setEnterToSend(!enterToSend)}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-background border border-border rounded-lg">
                    <CornerDownLeft className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <div className="font-medium text-text-primary">Enter to Send</div>
                    <div className="text-xs text-text-secondary">Send messages on Enter instead of new line.</div>
                  </div>
                </div>
                <div className={cn("w-10 h-6 rounded-full p-1 transition-colors relative", enterToSend ? "bg-accent" : "bg-border")}>
                  <div className={cn("w-4 h-4 bg-white rounded-full shadow transition-transform", enterToSend ? "translate-x-4" : "translate-x-0")} />
                </div>
              </div>

            </div>

            <div className="p-4 bg-background/50 border-t border-border flex justify-end">
              <button 
                onClick={close}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;

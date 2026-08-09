import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { cn } from '../../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  close: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, close }) => {
  const { 
    stealthMode, setStealthMode,
    burnOnRead, setBurnOnRead,
    crtEffect, setCrtEffect,
    timeFormat, setTimeFormat 
  } = useSettings();

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
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-[#0a0a0f] border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <div className="flex items-center gap-2 text-cyan-neon font-bold">
                <Settings className="w-5 h-5" />
                TERMINAL CONFIGURATION
              </div>
              <button onClick={close} className="text-muted-gray hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              
              {/* Toggle Item */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">Stealth Mode</div>
                  <div className="text-xs text-muted-gray">Obfuscate terminal text (blur). Unblur on hover.</div>
                </div>
                <button 
                  className={cn("w-12 h-6 rounded-full relative transition-colors border", stealthMode ? "bg-cyan-neon/20 border-cyan-neon" : "bg-white/5 border-white/20")}
                  onClick={() => setStealthMode(!stealthMode)}
                >
                  <span className={cn("absolute top-1 left-1 w-4 h-4 rounded-full transition-transform", stealthMode ? "bg-cyan-neon translate-x-6" : "bg-muted-gray translate-x-0")} />
                </button>
              </div>

              {/* Toggle Item */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-alert">Burn-On-Read</div>
                  <div className="text-xs text-muted-gray">Messages self-destruct after 10 seconds.</div>
                </div>
                <button 
                  className={cn("w-12 h-6 rounded-full relative transition-colors border", burnOnRead ? "bg-alert/20 border-alert" : "bg-white/5 border-white/20")}
                  onClick={() => setBurnOnRead(!burnOnRead)}
                >
                  <span className={cn("absolute top-1 left-1 w-4 h-4 rounded-full transition-transform", burnOnRead ? "bg-alert translate-x-6" : "bg-muted-gray translate-x-0")} />
                </button>
              </div>

              {/* Toggle Item */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">CRT Scanline FX</div>
                  <div className="text-xs text-muted-gray">Enable retro terminal visual effects.</div>
                </div>
                <button 
                  className={cn("w-12 h-6 rounded-full relative transition-colors border", crtEffect ? "bg-cyan-neon/20 border-cyan-neon" : "bg-white/5 border-white/20")}
                  onClick={() => setCrtEffect(!crtEffect)}
                >
                  <span className={cn("absolute top-1 left-1 w-4 h-4 rounded-full transition-transform", crtEffect ? "bg-cyan-neon translate-x-6" : "bg-muted-gray translate-x-0")} />
                </button>
              </div>

              {/* Selection Item */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">Timestamp Format</div>
                  <div className="text-xs text-muted-gray">Toggle between Local and UTC.</div>
                </div>
                <div className="flex border border-white/20 rounded overflow-hidden text-sm">
                  <button 
                    className={cn("px-3 py-1 transition-colors", timeFormat === 'UTC' ? "bg-white/20 text-white" : "text-muted-gray hover:bg-white/5")}
                    onClick={() => setTimeFormat('UTC')}
                  >
                    UTC
                  </button>
                  <button 
                    className={cn("px-3 py-1 border-l border-white/20 transition-colors", timeFormat === 'LOCAL' ? "bg-white/20 text-white" : "text-muted-gray hover:bg-white/5")}
                    onClick={() => setTimeFormat('LOCAL')}
                  >
                    LOCAL
                  </button>
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

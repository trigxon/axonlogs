import { Network, Users, ShieldAlert, Activity, UserPlus, Power, X } from 'lucide-react';
import { useCrypto } from '../../contexts/CryptoContext';
import { useSettings } from '../../contexts/SettingsContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  isOpen: boolean;
  close: () => void;
  openSettings?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, close, openSettings }) => {
  const { nodeId, activeNodes, username, roomCode, injectSystemMessage } = useCrypto();
  const { stealthMode, setStealthMode } = useSettings();

  const handleInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    // Could add a toast here
  };

  const handleTerminate = () => {
    window.location.href = 'about:blank';
  };

  const sidebarContent = (
    <div className="w-[260px] flex-shrink-0 bg-[#0a0a0f] border-r border-white/10 flex flex-col h-full z-30 relative">
      <div className="p-4 border-b border-white/10 flex justify-between items-center">
        <div>
          <div className="text-xs text-muted-gray mb-1">AXON_ROOT</div>
          <div className="text-matrix flex items-center gap-2 text-sm font-bold">
            <span className="w-2 h-2 rounded-full bg-matrix" />
            NODE: {nodeId}
          </div>
        </div>
        <button className="md:hidden text-muted-gray p-1" onClick={close}>
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <div className="text-cyan-neon border border-cyan-neon/30 bg-cyan-neon/10 text-xs px-2 py-1 rounded inline-block mb-4">
            [SYSADMIN]
          </div>
        </div>

        <nav className="space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-cyan-neon bg-white/5 rounded transition-colors">
            <Network className="w-4 h-4" />
            <span>Channels</span>
          </button>
          <button 
            onClick={() => injectSystemMessage(`[SCAN COMPLETE] Tracking ${activeNodes} active node(s) in local range.`, 'system')}
            className="w-full flex items-center gap-3 px-3 py-2 text-muted-gray hover:text-white hover:bg-white/5 rounded transition-colors"
          >
            <Users className="w-4 h-4" />
            <span>Nodes ({activeNodes})</span>
          </button>
          <button 
            onClick={() => {
              if (openSettings) {
                openSettings();
                close();
              }
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-muted-gray hover:text-white hover:bg-white/5 rounded transition-colors"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Security</span>
          </button>
          <button 
            onClick={() => injectSystemMessage(`[SESSION_INFO] \n> ALIAS: ${username} \n> ROOM: ${roomCode} \n> CIPHER: AES-256`, 'system')}
            className="w-full flex items-center gap-3 px-3 py-2 text-muted-gray hover:text-white hover:bg-white/5 rounded transition-colors"
          >
            <Activity className="w-4 h-4" />
            <span>Session</span>
          </button>
        </nav>
      </div>

      <div className="p-4 border-t border-white/10 space-y-4">
        <div className="flex items-center justify-between px-2 text-sm">
          <span className="text-muted-gray">STEALTH MODE</span>
          <button 
            className={cn("w-8 h-4 rounded-full relative transition-colors", stealthMode ? "bg-cyan-neon" : "bg-white/20")}
            onClick={() => setStealthMode(!stealthMode)}
          >
            <span className={cn("absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform", stealthMode ? "translate-x-4" : "translate-x-0")} />
          </button>
        </div>

        <button 
          onClick={handleInvite}
          className="w-full flex items-center justify-center gap-2 border border-white/20 hover:border-cyan-neon hover:text-cyan-neon text-muted-gray py-2 rounded transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          [ INVITE NODE ]
        </button>

        <button 
          onClick={handleTerminate}
          className="w-full flex items-center justify-center gap-2 bg-cyan-neon text-void font-bold py-2 rounded hover:bg-cyan-neon/80 transition-colors"
        >
          <Power className="w-4 h-4" />
          TERMINATE SESSION
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block h-full">
        {sidebarContent}
      </div>

      {/* Mobile */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-20"
              onClick={close}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed inset-y-0 left-0 z-30"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;

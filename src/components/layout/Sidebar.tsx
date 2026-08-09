import React, { useState } from 'react';
import { Settings, Plus, MessageSquare, Copy, X, Hash, LogIn } from 'lucide-react';
import { useCrypto } from '../../contexts/CryptoContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  onOpenSettings: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings, isMobileOpen, setIsMobileOpen }) => {
  const { chats, activeChat, setActiveChat, createChat, joinChat } = useCrypto();
  const [showNewModal, setShowNewModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'join'>('create');
  
  const [joinCode, setJoinCode] = useState('');
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (newName.trim()) {
      createChat(newName.trim());
      setShowNewModal(false);
      setNewName('');
      setIsMobileOpen(false);
    }
  };

  const handleJoin = () => {
    if (joinCode.trim()) {
      joinChat(joinCode.trim());
      setShowNewModal(false);
      setJoinCode('');
      setIsMobileOpen(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      <div className={cn(
        "fixed md:static inset-y-0 left-0 z-40 w-72 bg-panel border-r border-border flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        
        {/* BRANDING */}
        <div className="p-6 flex items-center justify-between shrink-0 border-b border-border">
          <div className="flex items-center gap-3">
            <Hash className="w-5 h-5 text-accent" />
            <h1 className="font-bold text-lg tracking-tight text-white uppercase" style={{ fontFamily: 'var(--font-mono)' }}>
              AXON // DASHBOARD
            </h1>
          </div>
          <button className="md:hidden p-2 text-text-secondary hover:text-white" onClick={() => setIsMobileOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WORKSPACE CONTROLS */}
        <div className="p-4 space-y-2 border-b border-border">
          <button 
            onClick={() => { setModalMode('create'); setShowNewModal(true); }}
            className="w-full py-2.5 px-4 bg-accent/10 hover:bg-accent/20 text-accent rounded-sm border border-accent/20 transition-colors flex items-center justify-center gap-2 font-medium text-sm font-mono"
          >
            <Plus className="w-4 h-4" />
            [ INITIALIZE TUNNEL ]
          </button>
          
          <button 
            onClick={() => { setModalMode('join'); setShowNewModal(true); }}
            className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white rounded-sm border border-white/10 transition-colors flex items-center justify-center gap-2 font-medium text-sm font-mono"
          >
            <LogIn className="w-4 h-4" />
            [ JOIN TUNNEL ]
          </button>
        </div>

        {/* CHAT LIST */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <div className="px-3 mb-2 text-xs font-semibold tracking-wider text-text-secondary font-mono">
              // ACTIVE_TUNNELS
            </div>
            <div className="space-y-0.5 font-mono">
              {chats.map(chat => (
                <div 
                  key={chat.id}
                  onClick={() => { setActiveChat(chat); setIsMobileOpen(false); }}
                  className={cn(
                    "group flex items-center justify-between p-2 rounded-sm cursor-pointer transition-colors text-sm",
                    activeChat?.id === chat.id ? "bg-accent/10 text-accent border-l-2 border-accent" : "text-text-secondary hover:bg-white/5 hover:text-text-primary border-l-2 border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span className="truncate">{chat.name}</span>
                  </div>
                  
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(chat.share_code);
                      }}
                      className="p-1 hover:bg-white/10 rounded-sm text-text-secondary hover:text-white transition-colors"
                      title="Copy Share Code"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {chats.length === 0 && (
                <div className="px-3 py-2 text-xs text-text-secondary/50">
                  NO ACTIVE CONNECTIONS.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CONFIG BUTTON */}
        <div className="p-4 border-t border-border bg-panel shrink-0">
          <button 
            onClick={onOpenSettings}
            className="w-full flex items-center justify-center gap-2 p-3 bg-background hover:bg-white/5 border border-border rounded-sm text-text-secondary hover:text-white transition-colors font-mono text-sm"
          >
            <Settings className="w-4 h-4" />
            [ CONFIG ]
          </button>
        </div>

      </div>

      {/* NEW/JOIN MODAL */}
      <AnimatePresence>
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowNewModal(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-panel border border-border p-6 shadow-2xl font-mono"
            >
              <h2 className="text-xl font-bold mb-4 text-white">
                {modalMode === 'create' ? '// INITIALIZE_NEW_TUNNEL' : '// JOIN_EXISTING_TUNNEL'}
              </h2>
              
              <div className="space-y-4">
                {modalMode === 'create' ? (
                  <div>
                    <label className="block text-xs text-text-secondary mb-2">TUNNEL_DESIGNATION</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Enter name..."
                        className="flex-1 bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors text-white"
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                      />
                      <button onClick={handleCreate} className="bg-accent hover:bg-accent-hover text-black px-4 py-2 text-sm font-bold transition-colors">
                        EXECUTE
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-text-secondary mb-2">SHARE_CODE_AUTH</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        placeholder="AXN-XXXX"
                        className="flex-1 bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors text-white uppercase"
                        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                      />
                      <button onClick={handleJoin} className="bg-accent hover:bg-accent-hover text-black px-4 py-2 text-sm font-bold transition-colors">
                        CONNECT
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;

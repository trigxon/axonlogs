import React, { useState } from 'react';
import { Settings, Plus, MessageSquare, Copy, X, Hash, LogIn, Edit2 } from 'lucide-react';
import { useCrypto } from '../../contexts/CryptoContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  onOpenSettings: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings, isMobileOpen, setIsMobileOpen }) => {
  const { chats, activeChat, setActiveChat, createChat, joinChat, renameChat } = useCrypto();
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

  const handleRename = (e: React.MouseEvent, chatId: string, currentName: string) => {
    e.stopPropagation();
    const input = window.prompt('Rename chat to:', currentName);
    if (input && input.trim()) {
      renameChat(chatId, input.trim());
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
            <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white">
              <MessageSquare className="w-4 h-4" />
            </div>
            <h1 className="font-bold text-lg tracking-tight text-text-primary">
              Axon
            </h1>
          </div>
          <button className="md:hidden p-2 text-text-secondary hover:text-text-primary" onClick={() => setIsMobileOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WORKSPACE CONTROLS */}
        <div className="p-4 space-y-2 border-b border-border">
          <button 
            onClick={() => { setModalMode('create'); setShowNewModal(true); }}
            className="w-full py-2.5 px-4 bg-accent hover:bg-accent-hover text-white rounded-xl transition-colors flex items-center justify-center gap-2 font-medium text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
          
          <button 
            onClick={() => { setModalMode('join'); setShowNewModal(true); }}
            className="w-full py-2.5 px-4 bg-background hover:bg-black/5 dark:hover:bg-white/5 text-text-primary rounded-xl border border-border transition-colors flex items-center justify-center gap-2 font-medium text-sm shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            Join Chat
          </button>
        </div>

        {/* CHAT LIST */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <div className="px-3 mb-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">
              Your Chats
            </div>
            <div className="space-y-0.5">
              {chats.map(chat => (
                <div 
                  key={chat.id}
                  onClick={() => { setActiveChat(chat); setIsMobileOpen(false); }}
                  className={cn(
                    "group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors text-sm",
                    activeChat?.id === chat.id ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-primary"
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Hash className="w-4 h-4 shrink-0 opacity-50" />
                    <span className="truncate">{chat.name}</span>
                  </div>
                  
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                    <button 
                      onClick={(e) => handleRename(e, chat.id, chat.name)}
                      className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-md text-text-secondary hover:text-text-primary transition-colors"
                      title="Rename Chat"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(chat.share_code);
                        alert(`Invite code copied: ${chat.share_code}`);
                      }}
                      className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-md text-text-secondary hover:text-text-primary transition-colors"
                      title="Copy Invite Code"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CONFIG BUTTON */}
        <div className="p-4 border-t border-border shrink-0">
          <button 
            onClick={onOpenSettings}
            className="w-full flex items-center justify-center gap-2 p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>

      </div>

      {/* NEW/JOIN MODAL */}
      <AnimatePresence>
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowNewModal(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-md bg-background border border-border shadow-xl rounded-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="text-lg font-bold text-text-primary">
                  {modalMode === 'create' ? 'New Chat' : 'Join Chat'}
                </h2>
                <button onClick={() => setShowNewModal(false)} className="p-2 text-text-secondary hover:bg-panel rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {modalMode === 'create' ? (
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">Chat Name</label>
                    <div className="flex flex-col gap-3">
                      <input 
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Enter name..."
                        className="w-full bg-panel border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-text-primary"
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                      />
                      <button onClick={handleCreate} className="w-full bg-accent hover:bg-accent-hover text-white rounded-xl px-4 py-3 text-sm font-bold transition-colors">
                        Create
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">Invite Code</label>
                    <div className="flex flex-col gap-3">
                      <input 
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        placeholder="AXN-XXXX"
                        className="w-full bg-panel border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-text-primary uppercase"
                        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                      />
                      <button onClick={handleJoin} className="w-full bg-accent hover:bg-accent-hover text-white rounded-xl px-4 py-3 text-sm font-bold transition-colors">
                        Connect
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

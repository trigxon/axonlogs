import React, { useState } from 'react';
import { Settings, Plus, MessageSquare, Copy, X, Hash } from 'lucide-react';
import { useCrypto } from '../../contexts/CryptoContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  onOpenSettings: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings, isMobileOpen, setIsMobileOpen }) => {
  const { chats, activeChat, setActiveChat, createChat, joinChat, deviceId } = useCrypto();
  const [showNewModal, setShowNewModal] = useState(false);
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
      {/* Mobile overlay */}
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
        <div className="p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent to-purple-500 flex items-center justify-center shadow-lg shadow-accent/20">
              <Hash className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              AXON LOGS
            </h1>
          </div>
          <button className="md:hidden p-2 text-text-secondary hover:text-white" onClick={() => setIsMobileOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NEW WORKSPACE BUTTON */}
        <div className="px-4 pb-4">
          <button 
            onClick={() => setShowNewModal(true)}
            className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-colors flex items-center justify-center gap-2 font-medium text-sm"
            style={{ borderRadius: 'var(--radius)' }}
          >
            <Plus className="w-4 h-4" />
            New Workspace
          </button>
        </div>

        {/* CHAT LIST */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-6">
          
          <div>
            <div className="px-3 mb-2 text-xs font-semibold tracking-wider text-text-secondary uppercase">
              Workspaces
            </div>
            <div className="space-y-0.5">
              {chats.map(chat => (
                <div 
                  key={chat.id}
                  onClick={() => { setActiveChat(chat); setIsMobileOpen(false); }}
                  className={cn(
                    "group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                    activeChat?.id === chat.id ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  )}
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  <div className="flex items-center gap-3 truncate">
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span className="font-medium truncate text-sm">{chat.name}</span>
                  </div>
                  
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(chat.share_code);
                      }}
                      className="p-1.5 hover:bg-white/10 rounded-md text-text-secondary hover:text-white transition-colors"
                      title="Copy Share Code"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {chats.length === 0 && (
                <div className="px-3 py-2 text-sm text-text-secondary italic">
                  No active workspaces.
                </div>
              )}
            </div>
          </div>

        </div>

        {/* PROFILE CARD */}
        <div className="p-4 border-t border-border bg-panel shrink-0">
          <div className="flex items-center justify-between bg-background border border-border p-3" style={{ borderRadius: 'var(--radius)' }}>
            <div className="flex items-center gap-3 truncate">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 text-white font-bold text-sm shadow-inner">
                {deviceId.slice(5, 7).toUpperCase()}
              </div>
              <div className="flex flex-col truncate">
                <span className="text-sm font-semibold text-text-primary truncate">Anonymous Agent</span>
                <span className="text-xs text-text-secondary truncate">{deviceId}</span>
              </div>
            </div>
            <button 
              onClick={onOpenSettings}
              className="p-2 hover:bg-white/5 rounded-lg text-text-secondary hover:text-white transition-colors shrink-0"
              style={{ borderRadius: 'var(--radius)' }}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

      </div>

      {/* NEW MODAL */}
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
              className="relative w-full max-w-md bg-panel border border-border p-6 shadow-2xl"
              style={{ borderRadius: 'var(--radius)' }}
            >
              <h2 className="text-xl font-bold mb-4">Initialize Workspace</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Create New</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Workspace Name..."
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                    <button onClick={handleCreate} className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      Create
                    </button>
                  </div>
                </div>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
                  <div className="relative flex justify-center"><span className="bg-panel px-2 text-xs text-text-secondary">OR</span></div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Join Existing</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      placeholder="Paste Share Code..."
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                      onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    />
                    <button onClick={handleJoin} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      Join
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;

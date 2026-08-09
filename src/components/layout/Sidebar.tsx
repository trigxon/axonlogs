import React, { useState } from 'react';
import { Settings, Plus, MessageSquare, Copy, Edit2, X, Trash2 } from 'lucide-react';
import { useCrypto, type Chat } from '../../contexts/CryptoContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  isOpen: boolean;
  close: () => void;
  openSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, close, openSettings }) => {
  const { chats, activeChat, setActiveChat, createChat, joinChat, leaveChat, renameChat } = useCrypto();
  const [joinCode, setJoinCode] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      joinChat(joinCode.trim());
      setJoinCode('');
    }
  };

  const startEditing = (chat: Chat) => {
    setEditingChatId(chat.id);
    setEditName(chat.name);
  };

  const saveEdit = () => {
    if (editingChatId && editName.trim()) {
      renameChat(editingChatId, editName.trim());
    }
    setEditingChatId(null);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    // Simple inline feedback could go here
  };

  const sidebarContent = (
    <div className="w-[280px] flex-shrink-0 bg-panel border-r border-border flex flex-col h-full z-30 relative shadow-2xl">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div className="font-bold text-lg tracking-tight">Direct Messages</div>
        <button className="md:hidden text-text-secondary hover:text-text-primary p-1" onClick={close}>
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 border-b border-border">
        <button 
          onClick={createChat}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white py-2 rounded-lg transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>

        <form onSubmit={handleJoin} className="flex gap-2">
          <input 
            type="text" 
            placeholder="Invite Code..." 
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
          />
          <button type="submit" className="bg-white/10 hover:bg-white/20 px-3 rounded-lg text-sm transition-colors">
            Join
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {chats.length === 0 ? (
          <div className="text-center text-sm text-text-secondary p-4 mt-10">
            No active chats.<br/>Create or join one!
          </div>
        ) : (
          chats.map(chat => (
            <div 
              key={chat.id}
              className={cn(
                "group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all",
                activeChat?.id === chat.id ? "bg-accent/10 text-accent font-medium" : "hover:bg-white/5 text-text-secondary hover:text-text-primary"
              )}
              onClick={() => setActiveChat(chat)}
            >
              {editingChatId === chat.id ? (
                <input 
                  type="text"
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={e => e.key === 'Enter' && saveEdit()}
                  className="bg-background border border-accent rounded px-2 py-1 text-sm w-full text-text-primary"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <div className="flex items-center gap-3 overflow-hidden">
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate text-sm">{chat.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); copyCode(chat.share_code); }}
                      className="p-1 hover:bg-white/10 rounded" title="Copy Invite Code"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); startEditing(chat); }}
                      className="p-1 hover:bg-white/10 rounded" title="Rename"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); leaveChat(chat.share_code); }}
                      className="p-1 hover:bg-danger/20 text-danger rounded" title="Leave Chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-border mt-auto">
        <button 
          onClick={() => { openSettings(); close(); }}
          className="w-full flex items-center gap-3 text-text-secondary hover:text-text-primary hover:bg-white/5 p-2 rounded-lg transition-colors text-sm font-medium"
        >
          <Settings className="w-5 h-5" />
          Settings
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block h-full shadow-2xl z-20 relative">
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
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={close}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed inset-y-0 left-0 z-50 shadow-2xl"
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

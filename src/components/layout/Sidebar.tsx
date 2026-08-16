import React, { useState } from 'react';
import {
  LayoutDashboard,
  Bot,
  Settings,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
  ShieldAlert,
  UserCheck,
  KeyRound,
  Plus,
  EyeOff,
  Search,
  Lock,
  LockOpen,
  Edit2,
  Key,
  Archive,
  Trash2,
  Power,
  ToggleRight,
  ToggleLeft,
} from 'lucide-react';
import { useCrypto } from '../../contexts/CryptoContext';

export type ActiveView = 'dashboard' | 'axon-ai' | 'settings' | 'logs';

export interface SidebarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onCreateTunnel: () => void;
  onRenameChat: (chatId: string) => void;
  onChangePassword: (chatId: string) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  isCollapsed,
  setIsCollapsed,
  searchQuery,
  setSearchQuery,
  onCreateTunnel,
  onRenameChat,
  onChangePassword,
  mobileOpen,
  onMobileClose,
}) => {
  const { alias, chats, activeChat, setActiveChat, joinChat, archiveChat, deleteChat, unlockedChatId } = useCrypto();

  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [stealthMode, setStealthMode] = useState(false);

  const coreNav = [
    { id: 'dashboard' as ActiveView, label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4 shrink-0" /> },
    { id: 'axon-ai' as ActiveView, label: 'Axon AI', icon: <Bot className="w-4 h-4 shrink-0" />, badge: 'AI' },
  ];

  const systemNav = [
    { id: 'settings' as ActiveView, label: 'Settings', icon: <Settings className="w-4 h-4 shrink-0" /> },
    { id: 'logs' as ActiveView, label: 'Logs', icon: <FileText className="w-4 h-4 shrink-0" /> },
  ];

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    const success = await joinChat(joinCode.trim().toUpperCase());
    if (success) {
      setJoinCode('');
      setIsJoining(false);
    } else {
      alert("Invalid code or chat not found.");
    }
  };

  const filteredChats = chats.filter(
    c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderNavGroup = (title: string, items: typeof coreNav) => (
    <div className="mb-4">
      {!isCollapsed && (
        <div className="px-3 mb-2 flex items-center gap-1.5 text-[10px] font-bold text-zinc-600 tracking-[0.2em] uppercase">
          <span className="w-1 h-1 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 inline-block" />
          {title}
        </div>
      )}
      <div className="space-y-1">
        {items.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                isActive
                  ? 'text-cyan-300 font-semibold bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent border border-cyan-400/25 shadow-[0_0_20px_-6px_rgba(34,211,238,0.4)]'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
            >
              {item.icon}
              {!isCollapsed && (
                <span className="truncate flex-1 text-left">{item.label}</span>
              )}
              {!isCollapsed && item.badge && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-gradient-to-r from-cyan-400/25 to-emerald-400/25 text-cyan-300 border border-cyan-400/30">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <aside
      className={`bg-gradient-to-b from-[#07070c] via-[#050507] to-[#040406] flex flex-col select-none overflow-y-auto md:overflow-visible
        fixed inset-y-0 left-0 z-50 w-[280px] transform transition-transform duration-300 shadow-2xl
        md:static md:z-30 md:shadow-none md:translate-x-0 md:border-r md:border-white/[0.06] ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'md:w-[72px]' : 'md:w-[260px]'}`}
    >
      {/* Header / Brand */}
      <div className="h-16 flex items-center justify-between px-4 mt-2 shrink-0">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="ring-gradient rounded-lg p-2 shrink-0">
              <ShieldAlert className="w-4 h-4 text-cyan-300" />
            </div>
            <span className="font-bold tracking-[0.2em] text-lg truncate flex items-center gap-2">
              <span className="text-gradient">AXON</span>
              <span className="text-zinc-500 font-light tracking-[0.15em]">LOGS</span>
            </span>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="ring-gradient rounded-lg p-2">
              <ShieldAlert className="w-4 h-4 text-cyan-300" />
            </div>
          </div>
        )}

        <button
          onClick={onMobileClose}
          title="Close Sidebar"
          className="md:hidden p-1.5 text-zinc-500 hover:text-cyan-300 hover:bg-white/5 rounded-lg transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(prev => !prev)}
            title="Collapse Sidebar"
            className="hidden md:inline-flex p-1.5 text-zinc-500 hover:text-cyan-300 hover:bg-white/5 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Collapse Toggle for collapsed state */}
      {isCollapsed && (
        <div className="p-2 flex justify-center mb-2 shrink-0">
          <button
            onClick={() => setIsCollapsed(prev => !prev)}
            title="Expand Sidebar"
            className="p-1.5 text-zinc-500 hover:text-cyan-300 hover:bg-white/5 rounded-lg transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="px-3 overflow-y-auto pt-2">
        {renderNavGroup('Core', coreNav)}
        {renderNavGroup('System', systemNav)}
      </nav>

      {/* Terminals Panel */}
      <div className="border-t border-white/[0.06] flex flex-col min-h-0 flex-1">
        <div className="px-4 pt-3 pb-1 shrink-0">
          <div className="text-[10px] font-bold tracking-widest text-zinc-500 mb-2 flex justify-between items-center uppercase">
            <span>Terminals</span>
            <span className="text-cyan-400/80 tabular-nums">{chats.length}</span>
          </div>

          {!isCollapsed && (
            <div className="flex items-center gap-2 bg-black/40 border border-white/[0.07] px-2 py-1.5 rounded-lg focus-within:border-cyan-400/50 focus-within:shadow-[0_0_14px_-4px_rgba(34,211,238,0.35)] mb-2 transition-all">
              <Search className="w-3 h-3 text-zinc-500" />
              <input
                type="text"
                placeholder="LOCAL SEARCH..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-[10px] text-zinc-300 w-full placeholder:text-zinc-700 uppercase"
              />
            </div>
          )}

          {/* Chat list */}
          <div className="overflow-y-auto max-h-[28vh] space-y-1 pr-0.5">
            {isCollapsed ? (
              <div className="flex flex-col items-center gap-2 py-1">
                {chats.slice(0, 12).map(chat => {
                  const isActive = activeChat?.id === chat.id;
                  const isLocked = unlockedChatId !== chat.id;
                  return (
                    <button
                      key={chat.id}
                      title={`${chat.name}${isLocked ? ' [LOCKED]' : ''}`}
                      onClick={() => setActiveChat(chat)}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        isActive ? (isLocked ? 'bg-amber-400 glow-amber' : 'bg-cyan-400 glow-cyan') : 'bg-zinc-700 hover:bg-zinc-500'
                      }`}
                    />
                  );
                })}
              </div>
            ) : (
              filteredChats.map(chat => {
                const isActive = activeChat?.id === chat.id;
                const isLocked = unlockedChatId !== chat.id;
                return (
                  <button
                    key={chat.id}
                    onClick={() => setActiveChat(chat)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-all duration-150 rounded-md border-l-2 ${
                      isActive
                        ? 'text-cyan-300 bg-gradient-to-r from-cyan-500/10 to-transparent border-cyan-400'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border-transparent'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLocked ? 'bg-amber-500/80' : 'bg-emerald-400 dot-live text-emerald-400'}`} />
                    <span className="truncate flex-1 text-left">{chat.name}</span>
                    {isLocked ? <Lock className="w-3 h-3 text-amber-500/70 shrink-0" /> : <LockOpen className="w-3 h-3 text-emerald-500/70 shrink-0" />}
                  </button>
                );
              })
            )}
            {!isCollapsed && filteredChats.length === 0 && (
              <div className="text-[10px] text-zinc-700 tracking-widest uppercase px-3 py-2">
                [NO TERMINALS]
              </div>
            )}
          </div>
        </div>

        {/* Active terminal operations - explicit buttons for every feature */}
        {!isCollapsed && activeChat && (
          <div className="px-4 py-3 border-t border-white/[0.06] shrink-0">
            <div className="text-[10px] font-bold tracking-widest text-zinc-500 mb-2 uppercase">
              TERMINAL OPS [{activeChat.name.slice(0, 12)}]
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => onRenameChat(activeChat.id)}
                title="Rename this terminal"
                className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-400 hover:text-cyan-300 border border-white/[0.08] hover:border-cyan-400/40 hover:shadow-[0_0_14px_-5px_rgba(34,211,238,0.5)] py-1.5 rounded-md transition-all uppercase tracking-widest bg-white/[0.02]"
              >
                <Edit2 className="w-3 h-3" /> RENAME
              </button>
              <button
                onClick={() => onChangePassword(activeChat.id)}
                title="Rotate the encryption passphrase"
                className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-400 hover:text-red-400 border border-white/[0.08] hover:border-red-400/40 hover:shadow-[0_0_14px_-5px_rgba(248,113,113,0.5)] py-1.5 rounded-md transition-all uppercase tracking-widest bg-white/[0.02]"
              >
                <Key className="w-3 h-3" /> KEY ROTATION
              </button>
              <button
                onClick={() => {
                  if (confirm(`Archive terminal "${activeChat.name}" from this device?`)) archiveChat(activeChat.id);
                }}
                title="Archive from this device"
                className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-400 hover:text-amber-400 border border-white/[0.08] hover:border-amber-400/40 py-1.5 rounded-md transition-all uppercase tracking-widest bg-white/[0.02]"
              >
                <Archive className="w-3 h-3" /> ARCHIVE
              </button>
              <button
                onClick={() => {
                  if (confirm(`WARNING: This will permanently wipe terminal "${activeChat.name}" and all its messages globally. Proceed?`)) deleteChat(activeChat.id);
                }}
                title="Wipe globally (deletes from everywhere)"
                className="flex items-center justify-center gap-1.5 text-[10px] text-red-500/80 hover:text-red-400 border border-red-900/40 hover:border-red-400/50 hover:shadow-[0_0_14px_-5px_rgba(248,113,113,0.6)] py-1.5 rounded-md transition-all uppercase tracking-widest bg-red-500/[0.03]"
              >
                <Trash2 className="w-3 h-3" /> WIPE
              </button>
            </div>
          </div>
        )}

        {/* Channel actions */}
        <div className="px-4 py-3 border-t border-white/[0.06] space-y-2 shrink-0">
          {isJoining ? (
            <form onSubmit={handleJoinSubmit} className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                placeholder="LINK CODE"
                className="w-full bg-black/40 border border-white/[0.08] text-xs px-2 py-1.5 rounded-md focus:border-cyan-400/60 focus:shadow-[0_0_14px_-4px_rgba(34,211,238,0.4)] outline-none text-white uppercase placeholder:text-zinc-700 transition-all"
                autoFocus
              />
              <button type="button" onClick={() => setIsJoining(false)} className="text-xs text-zinc-500 hover:text-white px-1">X</button>
            </form>
          ) : (
            <>
              <button
                onClick={() => setIsJoining(true)}
                className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-cyan-300 transition-all uppercase tracking-widest border border-white/[0.08] hover:border-cyan-400/40 hover:shadow-[0_0_14px_-5px_rgba(34,211,238,0.5)] p-2 rounded-md bg-white/[0.02]"
              >
                <span className="flex items-center gap-2"><KeyRound className="w-3 h-3" /> Join Link</span>
              </button>
              <button
                onClick={onCreateTunnel}
                className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-emerald-300 transition-all uppercase tracking-widest border border-white/[0.08] hover:border-emerald-500/40 hover:shadow-[0_0_14px_-5px_rgba(52,211,153,0.5)] p-2 rounded-md bg-white/[0.02]"
              >
                <span className="flex items-center gap-2"><Plus className="w-3 h-3" /> Create Tunnel</span>
              </button>
              <button
                onClick={() => setStealthMode(!stealthMode)}
                className="w-full flex items-center justify-between text-xs text-zinc-400 uppercase tracking-widest"
              >
                <span className="flex items-center gap-2 text-zinc-500">
                  <EyeOff className="w-3 h-3" /> Stealth Mode
                </span>
                <span className="text-zinc-500">
                  {stealthMode ? <ToggleRight className="w-5 h-5 text-cyan-400" /> : <ToggleLeft className="w-5 h-5" />}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Console / user box */}
      {!isCollapsed ? (
        <div className="p-4 mt-auto shrink-0">
          <div className="ring-gradient rounded-xl p-3 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500/25 to-emerald-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0 glow-cyan">
                <UserCheck className="w-4 h-4 text-cyan-300" />
              </div>
              <div className="flex flex-col overflow-hidden w-full">
                <span className="text-[9px] text-zinc-500 tracking-[0.15em] uppercase">CONSOLE WITH</span>
                <span className="text-xs font-bold text-gradient truncate uppercase tracking-widest">{alias || 'ANONYMOUS'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => setActiveView('settings')} className="p-1.5 text-zinc-500 hover:text-cyan-300 hover:bg-white/5 rounded-lg transition-colors bg-white/[0.03] border border-white/[0.06]" title="Settings">
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setActiveView('logs')} className="p-1.5 text-zinc-500 hover:text-cyan-300 hover:bg-white/5 rounded-lg transition-colors bg-white/[0.03] border border-white/[0.06]" title="Logs">
                <FileText className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 mt-auto flex justify-center shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/25 to-emerald-500/15 border border-cyan-400/30 flex items-center justify-center" title={alias || 'ANONYMOUS'}>
            <UserCheck className="w-5 h-5 text-cyan-300" />
          </div>
        </div>
      )}

      {/* Terminate Session */}
      <div className="px-4 pb-4 shrink-0">
        <button
          onClick={() => { localStorage.clear(); window.location.reload(); }}
          className={`w-full btn-premium py-3 rounded-lg ${isCollapsed ? 'px-0 flex items-center justify-center' : ''}`}
          title="Terminate session (wipes local data)"
        >
          {isCollapsed ? <Power className="w-4 h-4" /> : 'TERMINATE SESSION'}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

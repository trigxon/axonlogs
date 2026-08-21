import React, { useState, useEffect, useRef } from 'react';
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
  Search,
  Lock,
  LockOpen,
  Edit2,
  Key,
  Archive,
  Trash2,
  Power,
  MoreVertical,
} from 'lucide-react';
import { useCrypto, type Chat } from '../../contexts/CryptoContext';

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
  const { alias, chats, archivedChats, activeChat, setActiveChat, joinChat, archiveChat, restoreChat, deleteChat, unlockedChatId, networkStatus } = useCrypto();

  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; chatId: string } | null>(null);

  // The mobile drawer always renders the FULL expanded sidebar;
  // the icon rail only applies on desktop (md+).
  const railCollapsed = isCollapsed && !mobileOpen;

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

  // ---- Right-click context menu on chat rows ----
  const openContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 208;
    const menuHeight = 232;
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuWidth - 8));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - menuHeight - 8));
    setContextMenu({ x, y, chatId });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const menuChat: Chat | null = contextMenu
    ? chats.find(c => c.id === contextMenu.chatId) || archivedChats.find(c => c.id === contextMenu.chatId) || null
    : null;
  const menuChatIsArchived = !!contextMenu && archivedChats.some(c => c.id === contextMenu.chatId);

  const renderNavGroup = (title: string, items: typeof coreNav) => (
    <div className="mb-5">
      {!railCollapsed && (
        <div className="px-3 mb-2 flex items-center gap-1.5 text-[10px] font-bold text-zinc-600 tracking-[0.2em] uppercase">
          <span className="w-1 h-1 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 inline-block" />
          {title}
        </div>
      )}
      <div className="space-y-1.5">
        {items.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              title={railCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm term-interactive ${
                isActive
                  ? 'text-cyan-300 font-semibold term-input term-glow-cyan border-l-2 border-cyan-400/70'
                  : 'text-zinc-400 hover:text-zinc-100 term-panel-sm'
              } ${railCollapsed ? 'justify-center px-0' : ''}`}
            >
              {item.icon}
              {!railCollapsed && (
                <span className="truncate flex-1 text-left">{item.label}</span>
              )}
              {!railCollapsed && item.badge && (
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

  const renderSectionHeader = (label: string, count?: number) => (
    <div className={`text-[10px] font-bold tracking-[0.2em] text-zinc-600 mb-2 flex items-center uppercase ${count !== undefined ? 'justify-between' : ''}`}>
      <span className="flex items-center gap-1.5">
        <span className="w-1 h-1 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 inline-block" />
        {label}
      </span>
      {count !== undefined && <span className="text-cyan-400/80 tabular-nums">{count}</span>}
    </div>
  );

  // Touch swipe to close on mobile
  const touchStartXRef = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartXRef.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientX - touchStartXRef.current;
    if (delta < -60) onMobileClose(); // swipe left to close
  };

  return (
    <aside
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`bg-[#0a0a12] flex flex-col select-none overflow-y-auto md:overflow-visible
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 shadow-[12px_0_32px_-20px_rgba(0,0,0,0.95)]
        md:static md:z-30 md:translate-x-0 md:border-r md:border-white/[0.05] ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'md:w-[72px]' : 'w-[min(85vw,280px)] md:w-[260px]'}`}
    >
      {/* Header / Brand */}
      <div className="h-14 sm:h-16 flex items-center justify-between px-3 sm:px-4 mt-2 shrink-0">
        {!railCollapsed ? (
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
        {!railCollapsed && (
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
      {railCollapsed && (
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
      <nav className="px-3 overflow-y-auto pt-3 space-y-1">
        {renderNavGroup('Core', coreNav)}
        {renderNavGroup('System', systemNav)}
      </nav>

      {/* Terminals Panel */}
      <div className="border-t border-white/[0.06] flex flex-col min-h-0 flex-1">
        <div className="px-3 pt-4 pb-1 shrink-0">
          {railCollapsed ? (
            <div className="flex justify-center mb-2">
              <span className="text-cyan-400/80 tabular-nums text-[10px] font-bold">{chats.length}</span>
            </div>
          ) : (
            renderSectionHeader('Terminals', chats.length)
          )}

          {!railCollapsed && (
            <div className="flex items-center gap-2 term-input px-2 py-1.5 rounded-lg focus-within:ring-1 focus-within:ring-cyan-400/60 mb-2 transition-all">
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

          {/* Active chat list */}
          <div className="overflow-y-auto max-h-[30vh] space-y-1.5 pr-0.5">
            {railCollapsed ? (
              <div className="flex flex-col items-center gap-3 py-2">
                {chats.slice(0, 12).map(chat => {
                  const isActive = activeChat?.id === chat.id;
                  const isLocked = unlockedChatId !== chat.id;
                  return (
                    <button
                      key={chat.id}
                      title={`${chat.name}${isLocked ? ' [LOCKED]' : ''}`}
                      onClick={() => setActiveChat(chat)}
                      className={`w-3 h-3 rounded-full transition-all ${
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
                    onContextMenu={(e) => openContextMenu(e, chat.id)}
                    data-code={chat.share_code}
                    title={`${chat.name}${isLocked ? ' [LOCKED]' : ''} — right-click for options`}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-all duration-150 rounded-lg border-l-2 group ${
                      isActive
                        ? 'text-cyan-300 term-input border-cyan-400/70'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border-transparent'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLocked ? 'bg-amber-500/80' : 'bg-emerald-400 dot-live text-emerald-400'}`} />
                    <div className="flex flex-col min-w-0 flex-1 text-left">
                      <span className="truncate leading-tight">{chat.name}</span>
                    </div>
                    {isLocked ? <Lock className="w-3 h-3 text-amber-500/70 shrink-0" /> : <LockOpen className="w-3 h-3 text-emerald-500/70 shrink-0" />}
                    <MoreVertical className="w-3 h-3 text-zinc-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })
            )}
            {!railCollapsed && filteredChats.length === 0 && (
              <div className="text-[10px] text-zinc-700 tracking-widest uppercase px-3 py-2">
                [NO TERMINALS]
              </div>
            )}
          </div>
        </div>

        {/* Archived chats */}
        {!railCollapsed && archivedChats.length > 0 && (
          <div className="px-3 pt-4 pb-2 shrink-0 border-t border-white/[0.05]">
            {renderSectionHeader('Archived', archivedChats.length)}
            <div className="space-y-1 max-h-[20vh] overflow-y-auto pr-0.5">
              {archivedChats.map(chat => (
                <button
                  key={chat.id}
                  onClick={() => restoreChat(chat.id)}
                  onContextMenu={(e) => openContextMenu(e, chat.id)}
                  data-code={chat.share_code}
                  title={`Restore ${chat.name} — right-click for options`}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03] rounded-lg border-l-2 border-transparent transition-all duration-150 group"
                >
                  <Archive className="w-3 h-3 shrink-0 text-zinc-600" />
                  <div className="flex flex-col min-w-0 flex-1 text-left">
                    <span className="truncate leading-tight">{chat.name}</span>
                  </div>
                  <span className="text-[9px] text-zinc-700 uppercase tracking-widest group-hover:text-emerald-500/80 transition-colors shrink-0">
                    Restore
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Channel actions */}
        <div className="px-3 py-3 border-t border-white/[0.06] shrink-0">
          {railCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setIsJoining(true)}
                title="Join Link"
                className="term-panel-sm term-interactive w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-cyan-300"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onCreateTunnel}
                title="Create Tunnel"
                className="term-panel-sm term-interactive w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-emerald-300"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          ) : isJoining ? (
            <form onSubmit={handleJoinSubmit} className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                placeholder="LINK CODE"
                className="w-full term-input border border-white/[0.05] text-xs px-2 py-1.5 rounded-md focus:ring-1 focus:ring-cyan-400/60 outline-none text-white uppercase placeholder:text-zinc-700 transition-all"
                autoFocus
              />
              <button type="button" onClick={() => setIsJoining(false)} className="text-xs text-zinc-500 hover:text-white px-1">X</button>
            </form>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setIsJoining(true)}
                className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-cyan-300 term-interactive term-panel-sm border border-white/[0.05] hover:border-cyan-400/40 hover:shadow-[0_0_14px_-5px_rgba(34,211,238,0.5)] p-2 rounded-md uppercase tracking-widest"
              >
                <span className="flex items-center gap-2"><KeyRound className="w-3 h-3" /> Join Link</span>
              </button>
              <button
                type="button"
                onClick={onCreateTunnel}
                className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-emerald-300 term-interactive term-panel-sm border border-white/[0.05] hover:border-emerald-500/40 hover:shadow-[0_0_14px_-5px_rgba(52,211,153,0.5)] p-2 rounded-md uppercase tracking-widest"
              >
                <span className="flex items-center gap-2"><Plus className="w-3 h-3" /> Create Tunnel</span>
              </button>

            </div>
          )}
        </div>
      </div>

      {/* Console / user box */}
      {!railCollapsed ? (
        <div className="p-2.5 sm:p-3 mt-auto shrink-0">
          <div className="term-panel rounded-xl p-2.5 sm:p-3 flex flex-col gap-2.5 sm:gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500/25 to-emerald-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0 glow-cyan">
                <UserCheck className="w-4 h-4 text-cyan-300" />
              </div>
              <div className="flex flex-col overflow-hidden w-full">
                <span className="text-[9px] text-zinc-500 tracking-[0.15em] uppercase">CONSOLE WITH</span>
                <span className="text-xs font-bold text-gradient truncate uppercase tracking-widest">{alias || 'ANONYMOUS'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-zinc-500 pt-2 border-t border-white/[0.06]">
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${networkStatus === 'ONLINE' ? 'bg-emerald-400 dot-live text-emerald-400' : 'bg-amber-400/80'}`} />
                {networkStatus === 'ONLINE' ? 'Global Link' : 'Local Sandbox'}
              </span>
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
      <div className="px-3 pb-3 shrink-0">
        <button
          onClick={() => { localStorage.clear(); window.location.reload(); }}
          className={`w-full btn-premium py-3 rounded-lg ${railCollapsed ? 'px-0 flex items-center justify-center' : ''}`}
          title="Terminate session (wipes local data)"
        >
          {railCollapsed ? <Power className="w-4 h-4" /> : 'TERMINATE SESSION'}
        </button>
      </div>

      {/* Right-click context menu for chat operations */}
      {contextMenu && menuChat && !railCollapsed && (
        <div
          className="fixed z-[80] term-panel border border-white/[0.08] rounded-lg py-1.5 w-52 shadow-2xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[9px] font-bold tracking-widest text-zinc-500 uppercase border-b border-white/[0.06] mb-1 truncate">
            {menuChat.name}
          </div>
          <button
            onClick={() => { setContextMenu(null); onRenameChat(menuChat.id); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-cyan-300 hover:bg-cyan-400/[0.06] text-left transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" /> RENAME
          </button>
          <button
            onClick={() => { setContextMenu(null); onChangePassword(menuChat.id); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-red-400 hover:bg-red-400/[0.06] text-left transition-colors"
          >
            <Key className="w-3.5 h-3.5" /> KEY ROTATION
          </button>
          {menuChatIsArchived ? (
            <button
              onClick={() => { setContextMenu(null); restoreChat(menuChat.id); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-emerald-300 hover:bg-emerald-400/[0.06] text-left transition-colors"
            >
              <Archive className="w-3.5 h-3.5" /> RESTORE
            </button>
          ) : (
            <button
              onClick={() => {
                setContextMenu(null);
                if (confirm(`Archive terminal "${menuChat.name}"? It stays restorable under ARCHIVED.`)) archiveChat(menuChat.id);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-amber-300 hover:bg-amber-400/[0.06] text-left transition-colors"
            >
              <Archive className="w-3.5 h-3.5" /> ARCHIVE
            </button>
          )}
          <button
            onClick={() => {
              setContextMenu(null);
              if (confirm(`WARNING: Permanently wipe terminal "${menuChat.name}" and ALL its messages globally?`)) deleteChat(menuChat.id);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400/90 hover:text-red-300 hover:bg-red-500/[0.08] text-left transition-colors border-t border-white/[0.06] mt-1 pt-2"
          >
            <Trash2 className="w-3.5 h-3.5" /> WIPE GLOBALLY
          </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;

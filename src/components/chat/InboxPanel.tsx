import React, { useEffect, useState } from 'react';
import { Search, PlusSquare, KeyRound, Lock, MessageCircle } from 'lucide-react';
import { useCrypto, supabase, type Chat } from '../../contexts/CryptoContext';
import Avatar from '../profile/Avatar';
import {
  hydratePreviews,
  readCachedPreview,
  isUnread,
  formatChatTime,
  type ChatPreview,
} from '../../utils/chatMeta';

export interface InboxPanelProps {
  onOpenChat: (chat: Chat) => void;
  onOpenProfile: () => void;
  onNewMessage: () => void;
  onJoinCode: () => void;
  /** bumped by the shell whenever messages change so previews stay fresh */
  refreshKey: number;
}

/**
 * Instagram-DM-style inbox: header with your alias, search, ACTIVE row
 * (story rings for recent chats), then the chat list with previews,
 * unread dots and typing indicators — all in the Axon cyber theme.
 */
export const InboxPanel: React.FC<InboxPanelProps> = ({
  onOpenChat,
  onOpenProfile,
  onNewMessage,
  onJoinCode,
  refreshKey,
}) => {
  const { alias, deviceId, chats, archivedChats, activeChat, backendMode, typingUsers, onlineUsers, myGradient } = useCrypto();
  const [search, setSearch] = useState('');
  const [previews, setPreviews] = useState<Record<string, ChatPreview>>(() => {
    const map: Record<string, ChatPreview> = {};
    chats.forEach(c => {
      const p = readCachedPreview(c.id);
      if (p) map[c.id] = p;
    });
    return map;
  });

  // Hydrate last-message previews for every chat (local storage or Supabase)
  useEffect(() => {
    let cancelled = false;
    hydratePreviews(chats, backendMode, supabase).then(map => {
      if (!cancelled) setPreviews({ ...map });
    });
    return () => { cancelled = true; };
  }, [chats, backendMode, refreshKey]);

  const q = search.trim().toLowerCase();
  const visibleChats: Chat[] = chats
    .filter(c => !q || c.name.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => {
      const ta = previews[a.id] ? new Date(previews[a.id].at).getTime() : new Date(a.created_at || 0).getTime();
      const tb = previews[b.id] ? new Date(previews[b.id].at).getTime() : new Date(b.created_at || 0).getTime();
      return tb - ta;
    });

  const typingInActive = Object.keys(typingUsers).length > 0;
  const activeOnline = Object.keys(onlineUsers).length > 0;

  const renderRow = (chat: Chat) => {
    const isActive = activeChat?.id === chat.id;
    const preview = previews[chat.id] || readCachedPreview(chat.id);
    const unread = isUnread(chat.id, preview, deviceId);
    const isTyping = isActive && typingInActive;
    const mine = preview?.senderId === deviceId;

    return (
      <button
        key={chat.id}
        onClick={() => onOpenChat(chat)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left group ${
          isActive ? 'bg-cyan-500/[0.08] border border-cyan-400/30' : 'hover:bg-white/[0.035] border border-transparent'
        }`}
      >
        <Avatar
          seed={chat.id}
          name={chat.name}
          size={52}
          ring={unread ? 'story' : 'seen'}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`truncate text-sm ${unread ? 'text-white font-bold' : 'text-zinc-200 font-semibold'}`}>
              {chat.name}
            </span>
            {chat.share_code.startsWith('EPH-') && (
              <span className="text-[8px] font-bold tracking-widest text-red-400 border border-red-500/30 bg-red-500/10 rounded px-1 py-px shrink-0">
                EPH
              </span>
            )}
            <span className="ml-auto text-[10px] text-zinc-500 tabular-nums shrink-0">
              {preview ? formatChatTime(preview.at) : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isTyping ? (
              <span className="text-xs text-emerald-400 italic truncate flex items-center gap-1.5">
                typing
                <span className="flex gap-[2px] items-end">
                  <span className="typing-dot w-1 h-1 rounded-full bg-emerald-400" />
                  <span className="typing-dot w-1 h-1 rounded-full bg-emerald-400" />
                  <span className="typing-dot w-1 h-1 rounded-full bg-emerald-400" />
                </span>
              </span>
            ) : (
              <span className={`text-xs truncate ${unread ? 'text-zinc-100 font-semibold' : 'text-zinc-500'}`}>
                {mine && preview ? <span className="text-zinc-600">You: </span> : null}
                {preview?.text || 'End-to-end encrypted'}
              </span>
            )}
            {unread && <span className="w-2 h-2 rounded-full bg-cyan-400 glow-cyan shrink-0" />}
          </div>
        </div>
      </button>
    );
  };

  return (
    <section className="h-full flex flex-col min-w-0 bg-[#07070d]/60 md:border-r md:border-white/[0.05]">
      {/* Header — alias + actions (Instagram inbox header) */}
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-2 shrink-0">
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-2 min-w-0 group"
          title="Your profile"
        >
          <span className="font-bold text-lg tracking-wide text-white truncate group-hover:text-cyan-300 transition-colors">
            {alias || 'anonymous'}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-zinc-500 shrink-0">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onJoinCode}
            title="Join with a link code"
            className="p-2 rounded-full text-zinc-400 hover:text-cyan-300 hover:bg-white/5 transition-colors"
          >
            <KeyRound className="w-[22px] h-[22px]" />
          </button>
          <button
            onClick={onNewMessage}
            title="New message"
            className="p-2 rounded-full text-zinc-300 hover:text-cyan-300 hover:bg-white/5 transition-colors"
          >
            <PlusSquare className="w-[22px] h-[22px]" />
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 bg-white/[0.045] border border-white/[0.05] focus-within:border-cyan-400/40 rounded-lg px-3 py-2 transition-colors">
          <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent outline-none text-xs text-white placeholder:text-zinc-600"
            aria-label="Search chats"
          />
        </div>
      </div>

      {/* ACTIVE row — story-ring avatars of chats (Instagram notes/stories position) */}
      <div className="px-4 pt-2 pb-3 border-b border-white/[0.05] shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-start gap-4">
          {/* Your own avatar -> profile */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <Avatar seed={deviceId} name={alias || '?'} size={56} ring="story" gradient={myGradient} onClick={onOpenProfile} />
            <span className="text-[10px] text-zinc-500 max-w-[64px] truncate">Your note</span>
          </div>
          {visibleChats.slice(0, 10).map(chat => {
            const preview = previews[chat.id];
            const unread = isUnread(chat.id, preview, deviceId);
            return (
              <div key={chat.id} className="flex flex-col items-center gap-1.5 shrink-0">
                <Avatar
                  seed={chat.id}
                  name={chat.name}
                  size={56}
                  ring={unread ? 'story' : 'seen'}
                  onClick={() => onOpenChat(chat)}
                />
                <span className={`text-[10px] max-w-[64px] truncate ${unread ? 'text-zinc-200' : 'text-zinc-500'}`}>
                  {chat.name.toLowerCase()}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 min-h-0 overflow-y-auto feed-scroll px-2 py-2 space-y-0.5">
        {visibleChats.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
            <div className="w-16 h-16 rounded-full border border-cyan-400/30 bg-cyan-400/[0.06] flex items-center justify-center glow-cyan">
              <MessageCircle className="w-7 h-7 text-cyan-300" />
            </div>
            <div>
              <div className="text-white font-bold text-sm tracking-wide mb-1">No chats yet</div>
              <div className="text-zinc-500 text-xs leading-relaxed">
                Start a private, end-to-end encrypted conversation.<br />No feeds. No noise. Just chat.
              </div>
            </div>
            <button onClick={onNewMessage} className="btn-premium px-5 py-2.5 rounded-lg text-xs">
              Send first message
            </button>
          </div>
        ) : (
          visibleChats.map(renderRow)
        )}

        {archivedChats.length > 0 && !q && (
          <div className="pt-3 mt-2 border-t border-white/[0.05]">
            <div className="px-3 pb-1 text-[9px] font-bold tracking-[0.25em] text-zinc-600 uppercase">Archived</div>
            {archivedChats.map(chat => (
              <div key={chat.id} className="flex items-center gap-3 px-3 py-2 opacity-60">
                <Avatar seed={chat.id} name={chat.name} size={36} ring="seen" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-400 truncate">{chat.name}</div>
                  <div className="text-[10px] text-zinc-600 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> archived — restore from chat options
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {visibleChats.length > 0 && (
          <div className="pt-3 pb-2 text-center">
            <span className="text-[9px] tracking-[0.3em] uppercase text-zinc-700">
              {activeOnline ? 'Uplink established' : 'AES-256 • ephemeral • no logs'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
};

export default InboxPanel;

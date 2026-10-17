import React, { useEffect, useState } from 'react';
import { Search, PlusSquare, KeyRound, Lock, MessageCircle, Send } from 'lucide-react';
import { useCrypto, supabase, type Chat } from '../../contexts/CryptoContext';
import Avatar from '../profile/Avatar';
import {
  hydratePreviews,
  readCachedPreview,
  isUnread,
  formatChatTime,
  isKnownChatId,
  type ChatPreview,
} from '../../utils/chatMeta';
import { dmDisplayName, type Account } from '../../utils/auth';

export interface InboxPanelProps {
  onOpenChat: (chat: Chat) => void;
  onOpenProfile: () => void;
  onNewMessage: () => void;
  onJoinCode: () => void;
  /** bumped by the shell whenever messages change so previews stay fresh */
  refreshKey: number;
}

/**
 * Instagram-DM-style inbox: header with your @handle, search that finds
 * both your chats AND registered accounts (tap Message to DM them), then
 * the chat list with previews, unread dots and typing indicators — all
 * inside the Axon cyber theme. No stories, no notes, no feed rows.
 */
export const InboxPanel: React.FC<InboxPanelProps> = ({
  onOpenChat,
  onOpenProfile,
  onNewMessage,
  onJoinCode,
  refreshKey,
}) => {
  const {
    alias, deviceId, chats, archivedChats, activeChat, backendMode,
    typingUsers, onlineUsers, account, searchAccounts, startDmWithUser,
  } = useCrypto();
  const [search, setSearch] = useState('');
  const [accountResults, setAccountResults] = useState<Account[]>([]);
  const [searchingAccounts, setSearchingAccounts] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [startingDm, setStartingDm] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, ChatPreview>>(() => {
    const map: Record<string, ChatPreview> = {};
    chats.forEach(c => {
      const p = readCachedPreview(c.id);
      if (p) map[c.id] = p;
    });
    return map;
  });

  const myHandle = account?.username?.toLowerCase() || '';

  // Hydrate last-message previews for every chat (local storage or Supabase)
  useEffect(() => {
    let cancelled = false;
    hydratePreviews(chats, backendMode, supabase).then(map => {
      if (!cancelled) setPreviews({ ...map });
    });
    return () => { cancelled = true; };
  }, [chats, backendMode, refreshKey]);

  const q = search.trim().toLowerCase().replace(/^@/, '');

  // Instagram-style people search: look up registered accounts (debounced)
  useEffect(() => {
    if (!q || !account) {
      setAccountResults([]);
      setSearchingAccounts(false);
      return;
    }
    setSearchingAccounts(true);
    const t = setTimeout(() => {
      searchAccounts(q)
        .then(res => setAccountResults(res))
        .catch(() => setAccountResults([]))
        .finally(() => setSearchingAccounts(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q, account, searchAccounts]);

  // Inbox privacy: only channels this device created/joined (keyring ∪ known)
  const knownChats = chats.filter(c => isKnownChatId(c.id) || (myHandle && c.name === `@${myHandle}`));
  const visibleChats: Chat[] = knownChats
    .filter(c => !q || c.name.toLowerCase().includes(q) || (myHandle && dmDisplayName(c.name, myHandle).toLowerCase().includes(q)))
    .slice()
    .sort((a, b) => {
      const ta = previews[a.id] ? new Date(previews[a.id].at).getTime() : new Date(a.created_at || 0).getTime();
      const tb = previews[b.id] ? new Date(previews[b.id].at).getTime() : new Date(b.created_at || 0).getTime();
      return tb - ta;
    });

  const typingInActive = Object.keys(typingUsers).length > 0;
  const activeOnline = Object.keys(onlineUsers).length > 0;

  const handleDm = async (acc: Account) => {
    setDmError(null);
    setStartingDm(acc.username);
    const res = await startDmWithUser(acc.username);
    setStartingDm(null);
    if (res.ok && res.chat) {
      setSearch('');
      onOpenChat(res.chat);
    } else {
      setDmError(res.error || 'Could not start the chat.');
    }
  };

  const renderRow = (chat: Chat) => {
    const isActive = activeChat?.id === chat.id;
    const preview = previews[chat.id] || readCachedPreview(chat.id);
    const unread = isUnread(chat.id, preview, deviceId);
    const isTyping = isActive && typingInActive;
    const mine = preview?.senderId === deviceId;
    const displayName = myHandle ? dmDisplayName(chat.name, myHandle) : chat.name;
    const isDm = myHandle && displayName !== chat.name;

    return (
      <button
        key={chat.id}
        onClick={() => onOpenChat(chat)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left group ${
          isActive ? 'bg-cyan-500/[0.08] border border-cyan-400/30' : 'hover:bg-white/[0.035] border border-transparent'
        }`}
      >
        <Avatar
          seed={isDm ? displayName : chat.id}
          name={displayName}
          size={52}
          ring={unread ? 'story' : 'seen'}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`truncate text-sm ${unread ? 'text-white font-bold' : 'text-zinc-200 font-semibold'}`}>
              {displayName}
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
      {/* Header — your @handle + actions (Instagram inbox header) */}
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-2 shrink-0">
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-2 min-w-0 group"
          title="Your profile"
        >
          <span className="font-bold text-lg tracking-wide text-white truncate group-hover:text-cyan-300 transition-colors">
            {myHandle ? `@${myHandle}` : alias || 'anonymous'}
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
            onChange={e => { setSearch(e.target.value); setDmError(null); }}
            placeholder="Search chats or @usernames"
            className="flex-1 bg-transparent outline-none text-xs text-white placeholder:text-zinc-600"
            aria-label="Search chats and accounts"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 min-h-0 overflow-y-auto feed-scroll px-2 py-2 space-y-0.5">
        {/* ACCOUNTS — Instagram people results */}
        {q && (searchingAccounts || accountResults.length > 0) && (
          <div className="pb-2 mb-1 border-b border-white/[0.05]">
            <div className="px-3 pb-1.5 text-[9px] font-bold tracking-[0.25em] text-zinc-600 uppercase flex items-center gap-2">
              Accounts
              {searchingAccounts && <span className="text-cyan-500/70 animate-pulse">searching…</span>}
            </div>
            {accountResults.map(acc => (
              <div key={acc.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.035] transition-colors group">
                <Avatar seed={acc.username} name={`@${acc.username}`} size={44} gradient={acc.avatar_gradient || undefined} />
                <button onClick={() => handleDm(acc)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-white font-semibold truncate">@{acc.username}</div>
                  <div className="text-[10px] text-zinc-600 truncate">
                    {acc.bio?.trim() ? acc.bio : `Axon member · ${new Date(acc.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}`}
                  </div>
                </button>
                <button
                  onClick={() => handleDm(acc)}
                  disabled={startingDm === acc.username}
                  className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 transition-colors disabled:opacity-50"
                  title={`Message @${acc.username}`}
                >
                  <Send className="w-3 h-3" />
                  {startingDm === acc.username ? '…' : 'Message'}
                </button>
              </div>
            ))}
            {dmError && (
              <div className="mx-3 mt-1 p-2 bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] rounded-lg">
                {dmError}
              </div>
            )}
          </div>
        )}

        {visibleChats.length === 0 && !q ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
            <div className="w-16 h-16 rounded-full border border-cyan-400/30 bg-cyan-400/[0.06] flex items-center justify-center glow-cyan">
              <MessageCircle className="w-7 h-7 text-cyan-300" />
            </div>
            <div>
              <div className="text-white font-bold text-sm tracking-wide mb-1">No chats yet</div>
              <div className="text-zinc-500 text-xs leading-relaxed">
                Search a @username above to start a<br />private, end-to-end encrypted DM.
              </div>
            </div>
            <button onClick={onNewMessage} className="btn-premium px-5 py-2.5 rounded-lg text-xs">
              New message
            </button>
          </div>
        ) : (
          visibleChats.map(renderRow)
        )}

        {q && !searchingAccounts && accountResults.length === 0 && visibleChats.length === 0 && (
          <div className="py-10 text-center">
            <div className="text-zinc-500 text-xs">No chats or accounts match “{search.trim()}”.</div>
            <div className="text-zinc-600 text-[10px] mt-1">
              {backendMode === 'online' ? 'Try the full @username.' : 'Cloud search needs online mode.'}
            </div>
          </div>
        )}

        {archivedChats.length > 0 && !q && (
          <div className="pt-3 mt-2 border-t border-white/[0.05]">
            <div className="px-3 pb-1 text-[9px] font-bold tracking-[0.25em] text-zinc-600 uppercase">Archived</div>
            {archivedChats.map(chat => (
              <div key={chat.id} className="flex items-center gap-3 px-3 py-2 opacity-60">
                <Avatar seed={chat.id} name={chat.name} size={36} ring="seen" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-400 truncate">{myHandle ? dmDisplayName(chat.name, myHandle) : chat.name}</div>
                  <div className="text-[10px] text-zinc-600 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> archived — restore from chat options
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {visibleChats.length > 0 && !q && (
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

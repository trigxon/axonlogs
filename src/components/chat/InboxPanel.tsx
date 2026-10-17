import React, { useEffect, useState } from 'react';
import { Search, PlusSquare, KeyRound, Lock, MessageCircle, Send, Users, Check, X, UserCheck } from 'lucide-react';
import { useCrypto, supabase, type Chat } from '../../contexts/CryptoContext';
import Avatar from '../profile/Avatar';
import {
  hydratePreviews,
  readCachedPreview,
  isUnread,
  formatChatTime,
  isKnownChatId,
  dmPeer,
  getNickname,
  markRequestAccepted,
  readAcceptedRequests,
  type ChatPreview,
} from '../../utils/chatMeta';
import {
  dmDisplayName,
  fetchFollowState,
  followUser,
  unfollowUser,
  fetchBlockedUsers,
  type Account,
  type FollowState,
} from '../../utils/auth';

export interface InboxPanelProps {
  onOpenChat: (chat: Chat) => void;
  onOpenProfile: () => void;
  onNewMessage: () => void;
  onNewGroup: () => void;
  onJoinCode: () => void;
  /** bumped by the shell whenever messages change so previews stay fresh */
  refreshKey: number;
}

/**
 * Instagram-DM-style inbox: header with your @handle, Primary/Requests
 * tabs, search that finds both your chats AND registered accounts (with
 * Follow/Following buttons), then the chat list with previews, unread
 * dots and typing indicators — all inside the Axon cyber theme.
 * No stories, no notes, no feed rows.
 */
export const InboxPanel: React.FC<InboxPanelProps> = ({
  onOpenChat,
  onOpenProfile,
  onNewMessage,
  onNewGroup,
  onJoinCode,
  refreshKey,
}) => {
  const {
    alias, deviceId, chats, archivedChats, activeChat, backendMode,
    typingUsers, onlineUsers, account, searchAccounts, startDmWithUser,
    archiveChat,
  } = useCrypto();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'primary' | 'requests'>('primary');
  const [accountResults, setAccountResults] = useState<Account[]>([]);
  const [searchingAccounts, setSearchingAccounts] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [startingDm, setStartingDm] = useState<string | null>(null);
  const [followMap, setFollowMap] = useState<Record<string, FollowState>>({});
  const [blockList, setBlockList] = useState<string[]>([]);
  const [acceptedTick, setAcceptedTick] = useState(0);
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

  // My blocklist (search hides blocked accounts, Instagram behavior)
  useEffect(() => {
    if (!supabase || !myHandle) { setBlockList([]); return; }
    fetchBlockedUsers(supabase, myHandle).then(setBlockList).catch(() => setBlockList([]));
  }, [myHandle, refreshKey]);

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

  // Follow states for the visible account results (Follow/Following buttons)
  useEffect(() => {
    if (!supabase || !myHandle || accountResults.length === 0) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, FollowState> = {};
      await Promise.all(accountResults.map(async acc => {
        next[acc.username] = await fetchFollowState(supabase!, myHandle, acc.username);
      }));
      if (!cancelled) setFollowMap(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [accountResults, myHandle]);

  const toggleFollow = async (acc: Account) => {
    const state = followMap[acc.username] || { following: false, requested: false, followsMe: false };
    if (state.following || state.requested) {
      await unfollowUser(supabase, myHandle, acc.username);
      setFollowMap(prev => ({ ...prev, [acc.username]: { ...state, following: false, requested: false } }));
    } else {
      const status = await followUser(supabase, myHandle, acc.username, acc.is_private === true);
      setFollowMap(prev => ({
        ...prev,
        [acc.username]: { ...state, following: status === 'active', requested: status === 'pending' },
      }));
    }
  };

  // Partition known chats into Primary vs Requests (Instagram rules:
  // DMs from people I don't follow are requests until accepted)
  const knownChats = chats.filter(c => isKnownChatId(c.id) || (myHandle && c.name === `@${myHandle}`));
  const acceptedIds = readAcceptedRequests();
  const isRequestChat = (chat: Chat): boolean => {
    if (!supabase || !myHandle) return false;
    if (acceptedIds.includes(chat.id)) return false;
    const peer = dmPeer(chat.name, myHandle);
    if (!peer) return false; // groups are always primary
    const st = followMap[peer];
    return st ? !st.following : false;
  };
  const dmPeerIds = new Set(knownChats.map(c => dmPeer(c.name, myHandle)).filter(Boolean));
  useEffect(() => {
    // fetch follow states for all DM peers so the split stays accurate
    if (!supabase || !myHandle || dmPeerIds.size === 0) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, FollowState> = {};
      await Promise.all([...dmPeerIds].map(async peer => {
        next[peer as string] = await fetchFollowState(supabase!, myHandle, peer as string);
      }));
      if (!cancelled) setFollowMap(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [chats, myHandle, acceptedTick]);

  const requestChats = knownChats.filter(isRequestChat);
  const primaryChats = knownChats.filter(c => !isRequestChat(c));

  const filterNamed = (list: Chat[]) =>
    list.filter(c => {
      if (!q) return true;
      const peer = dmPeer(c.name, myHandle || '');
      const nick = peer ? getNickname(c.id, peer) : '';
      return c.name.toLowerCase().includes(q)
        || (myHandle && dmDisplayName(c.name, myHandle).toLowerCase().includes(q))
        || (nick && nick.toLowerCase().includes(q));
    });

  const visibleChats: Chat[] = filterNamed(primaryChats).slice().sort((a, b) => {
    const ta = previews[a.id] ? new Date(previews[a.id].at).getTime() : new Date(a.created_at || 0).getTime();
    const tb = previews[b.id] ? new Date(previews[b.id].at).getTime() : new Date(b.created_at || 0).getTime();
    return tb - ta;
  });
  const visibleRequests: Chat[] = filterNamed(requestChats).slice().sort((a, b) => {
    const ta = previews[a.id] ? new Date(previews[a.id].at).getTime() : new Date(a.created_at || 0).getTime();
    const tb = previews[b.id] ? new Date(previews[b.id].at).getTime() : new Date(b.created_at || 0).getTime();
    return tb - ta;
  });

  const typingInActive = Object.keys(typingUsers).length > 0;
  const activeOnline = Object.keys(onlineUsers).length > 0;

  const handleDm = async (acc: Account) => {
    setDmError(null);
    // FOLLOW GATE: chats are only for people you follow
    const st = followMap[acc.username];
    if (!st?.following) {
      setDmError(
        st?.requested
          ? `Your follow request to @${acc.username} hasn't been accepted yet.`
          : `Follow @${acc.username} first — you can only message people you follow.`
      );
      return;
    }
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

  const acceptRequest = (chat: Chat) => {
    markRequestAccepted(chat.id);
    setAcceptedTick(t => t + 1);
  };

  const deleteRequest = (chat: Chat) => {
    archiveChat(chat.id);
    setAcceptedTick(t => t + 1);
  };

  const renderRow = (chat: Chat) => {
    const isActive = activeChat?.id === chat.id;
    const preview = previews[chat.id] || readCachedPreview(chat.id);
    const unread = isUnread(chat.id, preview, deviceId);
    const isTyping = isActive && typingInActive;
    const mine = preview?.senderId === deviceId;
    const peer = myHandle ? dmPeer(chat.name, myHandle) : null;
    const nick = peer ? getNickname(chat.id, peer) : '';
    const isDm = !!peer;
    const displayName = isDm
      ? (nick || (myHandle ? dmDisplayName(chat.name, myHandle) : chat.name))
      : chat.name;

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
            {isDm ? (
              <span className={`truncate text-sm ${unread ? 'text-white font-bold' : 'text-zinc-200 font-semibold'}`}>
                {displayName.startsWith('@') ? displayName : `${displayName} `}
                {!nick && peer ? <span className="text-zinc-600">@{peer}</span> : null}
              </span>
            ) : (
              <span className={`truncate text-sm ${unread ? 'text-white font-bold' : 'text-zinc-200 font-semibold'}`}>
                {displayName}
              </span>
            )}
            {!isDm && (
              <span className="text-[8px] font-bold tracking-widest text-cyan-300 border border-cyan-400/30 bg-cyan-400/10 rounded px-1 py-px shrink-0 flex items-center gap-1">
                <Users className="w-2.5 h-2.5" /> GROUP
              </span>
            )}
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
                {preview?.text || 'Say hi…'}
              </span>
            )}
            {unread && <span className="w-2 h-2 rounded-full bg-cyan-400 glow-cyan shrink-0" />}
          </div>
        </div>
      </button>
    );
  };

  const renderRequestRow = (chat: Chat) => {
    const preview = previews[chat.id] || readCachedPreview(chat.id);
    const peer = myHandle ? dmPeer(chat.name, myHandle) : null;
    const displayName = myHandle ? dmDisplayName(chat.name, myHandle) : chat.name;
    return (
      <div key={chat.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.035] transition-colors">
        <Avatar seed={displayName} name={displayName} size={48} ring="seen" />
        <button onClick={() => onOpenChat(chat)} className="flex-1 min-w-0 text-left">
          <div className="text-sm text-white font-semibold truncate">{displayName}</div>
          <div className="text-[10px] text-zinc-600 truncate">
            {preview?.text || 'Wants to chat with you'}
          </div>
        </button>
        <button
          onClick={() => acceptRequest(chat)}
          className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/25 transition-colors"
          title="Accept request"
        >
          <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Accept</span>
        </button>
        <button
          onClick={() => deleteRequest(chat)}
          className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-red-300 hover:border-red-400/30 transition-colors"
          title="Delete request"
        >
          <span className="flex items-center gap-1"><X className="w-3 h-3" /> Delete</span>
        </button>
        {peer ? null : null}
      </div>
    );
  };

  const followButton = (acc: Account, withMessage = false) => {
    const st = followMap[acc.username];
    if (st?.following) {
      return (
        <>
          <button
            onClick={() => toggleFollow(acc)}
            className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 hover:border-white/25 transition-colors"
            title={`Following @${acc.username} — tap to unfollow`}
          >
            <span className="flex items-center gap-1"><UserCheck className="w-3 h-3" /> Following</span>
          </button>
          {withMessage && (
            <button
              onClick={() => handleDm(acc)}
              disabled={startingDm === acc.username}
              className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 transition-colors disabled:opacity-50"
              title={`Message @${acc.username}`}
            >
              <Send className="w-3 h-3" />
              {startingDm === acc.username ? '…' : 'Message'}
            </button>
          )}
        </>
      );
    }
    if (st?.requested) {
      return (
        <button
          onClick={() => toggleFollow(acc)}
          className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 transition-colors"
          title="Follow request sent — tap to cancel"
        >
          Requested
        </button>
      );
    }
    return (
      <button
        onClick={() => toggleFollow(acc)}
        className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/25 transition-colors"
        title={`Follow @${acc.username}`}
      >
        Follow
      </button>
    );
  };

  const filteredAccounts = accountResults.filter(acc => !blockList.includes(acc.username));

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

      {/* Primary / Requests tabs (Instagram) */}
      <div className="px-4 shrink-0 flex items-center gap-4 border-b border-white/[0.05]">
        {(['primary', 'requests'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 pt-1 text-[11px] font-bold tracking-[0.2em] uppercase border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              tab === t ? 'text-cyan-300 border-cyan-400' : 'text-zinc-600 border-transparent hover:text-zinc-400'
            }`}
          >
            {t === 'primary' ? 'Primary' : 'Requests'}
            {t === 'requests' && visibleRequests.length > 0 && (
              <span className="text-[9px] bg-red-500/80 text-white rounded-full px-1.5 py-px leading-none">
                {visibleRequests.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 pt-2 pb-2 shrink-0">
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
        {q && (searchingAccounts || filteredAccounts.length > 0) && (
          <div className="pb-2 mb-1 border-b border-white/[0.05]">
            <div className="px-3 pb-1.5 text-[9px] font-bold tracking-[0.25em] text-zinc-600 uppercase flex items-center gap-2">
              Accounts
              {searchingAccounts && <span className="text-cyan-500/70 animate-pulse">searching…</span>}
            </div>
            {filteredAccounts.map(acc => (
              <div key={acc.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.035] transition-colors group">
                <Avatar seed={acc.username} name={`@${acc.username}`} size={44} gradient={acc.avatar_gradient || undefined} />
                <button onClick={() => handleDm(acc)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-white font-semibold truncate">@{acc.username}</div>
                  <div className="text-[10px] text-zinc-600 truncate">
                    {acc.display_name?.trim() ? `${acc.display_name} · ` : ''}
                    {acc.bio?.trim() ? acc.bio : `Member since ${new Date(acc.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}`}
                  </div>
                </button>
                {followButton(acc, true)}
              </div>
            ))}
            {dmError && (
              <div className="mx-3 mt-1 p-2 bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] rounded-lg">
                {dmError}
              </div>
            )}
          </div>
        )}

        {tab === 'primary' ? (
          <>
            {visibleChats.length === 0 && !q ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
                <div className="w-16 h-16 rounded-full border border-cyan-400/30 bg-cyan-400/[0.06] flex items-center justify-center glow-cyan">
                  <MessageCircle className="w-7 h-7 text-cyan-300" />
                </div>
                <div>
                  <div className="text-white font-bold text-sm tracking-wide mb-1">No chats yet</div>
                  <div className="text-zinc-500 text-xs leading-relaxed">
                    Follow someone, then message them.<br />Search a @username above to get started.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={onNewMessage} className="btn-premium px-5 py-2.5 rounded-lg text-xs">
                    New message
                  </button>
                  <button
                    onClick={onNewGroup}
                    className="term-panel term-interactive px-5 py-2.5 rounded-lg text-xs text-zinc-300 hover:text-cyan-300 border border-white/[0.07] transition-colors flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5" /> New group
                  </button>
                </div>
              </div>
            ) : (
              visibleChats.map(renderRow)
            )}
          </>
        ) : (
          <>
            {visibleRequests.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                <div className="w-14 h-14 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-zinc-600" />
                </div>
                <div className="text-zinc-500 text-xs">No message requests right now.</div>
              </div>
            ) : (
              visibleRequests.map(renderRequestRow)
            )}
          </>
        )}

        {q && !searchingAccounts && filteredAccounts.length === 0 && visibleChats.length === 0 && visibleRequests.length === 0 && (
          <div className="py-10 text-center">
            <div className="text-zinc-500 text-xs">No chats or people match “{search.trim()}”.</div>
            <div className="text-zinc-600 text-[10px] mt-1">
              {backendMode === 'online' ? 'Try the full @username.' : 'Search works when you\'re online.'}
            </div>
          </div>
        )}

        {archivedChats.length > 0 && !q && tab === 'primary' && (
          <div className="pt-3 mt-2 border-t border-white/[0.05]">
            <div className="px-3 pb-1 text-[9px] font-bold tracking-[0.25em] text-zinc-600 uppercase">Archived</div>
            {archivedChats.map(chat => (
              <div key={chat.id} className="flex items-center gap-3 px-3 py-2 opacity-60">
                <Avatar seed={chat.id} name={chat.name} size={36} ring="seen" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-400 truncate">{myHandle ? dmDisplayName(chat.name, myHandle) : chat.name}</div>
                  <div className="text-[10px] text-zinc-600 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Archived — open it, then choose Unarchive
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {visibleChats.length > 0 && !q && tab === 'primary' && (
          <div className="pt-3 pb-2 text-center">
            <span className="text-[9px] tracking-[0.3em] uppercase text-zinc-700">
              {activeOnline ? 'Connected' : 'Private — only you two can read these messages'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
};

export default InboxPanel;

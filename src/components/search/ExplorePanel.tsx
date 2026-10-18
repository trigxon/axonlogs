import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, X, Clock, MessageCircle, Users } from 'lucide-react';
import { supabase, useCrypto } from '../../contexts/CryptoContext';
import {
  searchAccounts, fetchFollowState, followUser, unfollowUser,
  fetchFollowing, fetchAccountsByUsernames, isBlockedEitherWay,
  type Account, type FollowState,
} from '../../utils/auth';
import { StoryAvatar } from '../stories/StoriesRail';

export interface ExplorePanelProps {
  onBack: () => void;
  onOpenProfile: (username: string) => void;
  onMessage: (username: string) => Promise<{ ok: boolean; error?: string }>;
}

const RECENT_KEY = 'axon_recent_searches';

const readRecent = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(0, 12) : [];
  } catch {
    return [];
  }
};

const writeRecent = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* storage unavailable */
  }
};

/**
 * People discovery (Instagram "Search / Explore", minus the feed):
 * username + display-name search, recent searches (device-local),
 * suggestions = people you follow, one-tap follow + message.
 * Blocked accounts (either direction) are filtered out of results.
 */
export const ExplorePanel: React.FC<ExplorePanelProps> = ({ onBack, onOpenProfile, onMessage }) => {
  const { account } = useCrypto();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Account[]>([]);
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const [suggested, setSuggested] = useState<Account[]>([]);
  const [follow, setFollow] = useState<Record<string, FollowState>>({});
  const [searching, setSearching] = useState(false);
  const [msgBusy, setMsgBusy] = useState('');
  const [msgError, setMsgError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const me = account?.username?.trim().toLowerCase() || '';

  // suggestions: people I follow (Instagram's "Suggested for you" base)
  useEffect(() => {
    if (!supabase || !me || query.trim()) return;
    fetchFollowing(supabase, me, 30)
      .then(handles => fetchAccountsByUsernames(supabase, handles))
      .then(accs => {
        setSuggested(accs);
        hydrateFollow(accs);
      })
      .catch(() => setSuggested([]));
  }, [me, query]);

  const hydrateFollow = async (accs: Account[]) => {
    if (!supabase || !me) return;
    const pairs = await Promise.all(
      accs.map(async a => ({ u: a.username, s: await fetchFollowState(supabase, me, a.username) }))
    );
    setFollow(prev => {
      const next = { ...prev };
      pairs.forEach(p => { next[p.u] = p.s; });
      return next;
    });
  };

  // debounced search — hide blocked accounts (either direction)
  useEffect(() => {
    const q = query.trim();
    if (!q || !supabase || !me) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchAccounts(supabase, q, me, 20);
        const checks = await Promise.all(res.map(a => isBlockedEitherWay(supabase, me, a.username)));
        const visible = res.filter((_, i) => !checks[i]);
        setResults(visible);
        hydrateFollow(visible);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 240);
    return () => clearTimeout(t);
  }, [query, me]);

  const commitSearch = (term?: string) => {
    const q = (term ?? query).trim().replace(/^@/, '');
    if (!q) return;
    const next = [q, ...readRecent().filter(x => x !== q)];
    writeRecent(next);
    setRecent(next.slice(0, 12));
  };

  const clearRecent = () => {
    writeRecent([]);
    setRecent([]);
  };

  const toggleFollow = async (acc: Account) => {
    if (!supabase || !me) return;
    const st = follow[acc.username] || { following: false, requested: false, followsMe: false };
    if (st.following || st.requested) {
      await unfollowUser(supabase, me, acc.username);
      setFollow(prev => ({ ...prev, [acc.username]: { ...st, following: false, requested: false } }));
    } else {
      const status = await followUser(supabase, me, acc.username, acc.is_private === true);
      setFollow(prev => ({
        ...prev,
        [acc.username]: { ...st, following: status === 'active', requested: status === 'pending' },
      }));
    }
  };

  const handleMessage = async (username: string) => {
    setMsgError(null);
    setMsgBusy(username);
    const res = await onMessage(username);
    setMsgBusy('');
    if (!res.ok) setMsgError(res.error || 'Could not start the chat.');
  };

  const row = (acc: Account, showPreview: string) => {
    const st = follow[acc.username];
    const isFollowed = st?.following;
    return (
      <div key={acc.id} className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
        <button type="button" onClick={() => { commitSearch(acc.username); onOpenProfile(acc.username); }} className="shrink-0">
          <StoryAvatar username={acc.username} size={46} ring="none" />
        </button>
        <button
          type="button"
          onClick={() => { commitSearch(acc.username); onOpenProfile(acc.username); }}
          className="flex-1 min-w-0 text-left"
        >
          <div className="text-sm text-white font-semibold truncate">@{acc.username}</div>
          <div className="text-[11px] text-zinc-500 truncate">{showPreview}</div>
        </button>
        {isFollowed ? (
          <>
            <button
              type="button"
              onClick={() => toggleFollow(acc)}
              className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 hover:border-white/25 transition-colors"
              title="Tap to unfollow"
            >
              Following
            </button>
            <button
              type="button"
              onClick={() => handleMessage(acc.username)}
              disabled={msgBusy === acc.username}
              className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/25 transition-colors flex items-center gap-1"
              title={`Message @${acc.username}`}
            >
              <MessageCircle className="w-3 h-3" />
              {msgBusy === acc.username ? '…' : 'Chat'}
            </button>
          </>
        ) : st?.requested ? (
          <button
            type="button"
            onClick={() => toggleFollow(acc)}
            className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 transition-colors"
            title="Tap to cancel the request"
          >
            Requested
          </button>
        ) : (
          <button
            type="button"
            onClick={() => toggleFollow(acc)}
            className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-4 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/25 transition-colors"
          >
            Follow
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#07070d]/80">
      <header className="shrink-0 flex items-center gap-3 px-3 sm:px-4 h-[56px] border-b border-white/[0.06]">
        <button onClick={onBack} className="md:hidden p-1.5 text-zinc-400 hover:text-white" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitSearch(); }}
            placeholder="Search people by username or name…"
            className="w-full term-input rounded-full pl-9 pr-9 py-2.5 text-white text-sm outline-none focus:border-cyan-500/60"
            autoFocus
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {msgError && (
        <div className="mx-3 mt-2 p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">{msgError}</div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto feed-scroll py-2">
        {query.trim() ? (
          <>
            <h3 className="text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase px-4 py-2">
              {searching ? 'Searching…' : `People · ${results.length}`}
            </h3>
            {!searching && results.length === 0 && (
              <div className="py-14 text-center">
                <Search className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">No people found for “{query.trim()}”.</p>
                <p className="text-zinc-600 text-xs mt-1">Check the spelling or try another name.</p>
              </div>
            )}
            {results.map(acc =>
              row(acc, acc.display_name?.trim() || acc.bio?.trim() || 'Private chat — follow them first')
            )}
          </>
        ) : (
          <>
            {recent.length > 0 && (
              <section className="px-1 pb-2">
                <div className="flex items-center justify-between px-3 py-2">
                  <h3 className="text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Recent
                  </h3>
                  <button onClick={clearRecent} className="text-[10px] font-bold tracking-widest uppercase text-cyan-300 hover:text-cyan-200">
                    Clear all
                  </button>
                </div>
                {recent.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setQuery(r); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] text-left"
                  >
                    <Clock className="w-4 h-4 text-zinc-600 shrink-0" />
                    <span className="text-sm text-zinc-200 truncate">@{r}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => {
                        e.stopPropagation();
                        const next = recent.filter(x => x !== r);
                        writeRecent(next);
                        setRecent(next);
                      }}
                      className="ml-auto text-zinc-600 hover:text-white p-1"
                      aria-label={`Remove ${r} from recent searches`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </span>
                  </button>
                ))}
              </section>
            )}
            <section className="px-1">
              <h3 className="text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase px-3 py-2 flex items-center gap-1.5">
                <Users className="w-3 h-3" /> You follow
              </h3>
              {suggested.length === 0 && (
                <p className="text-zinc-600 text-xs px-4 py-6 leading-relaxed">
                  You're not following anyone yet. Search a @username above, follow them, and their stories
                  and chats will show up here.
                </p>
              )}
              {suggested.map(acc =>
                row(acc, acc.display_name?.trim() || acc.bio?.trim() || 'Tap Chat to open your private conversation')
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default ExplorePanel;

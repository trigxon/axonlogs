import React, { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { supabase, useCrypto } from '../../contexts/CryptoContext';
import { fetchFollowing } from '../../utils/auth';
import { fetchStoryTray, type StoryTrayEntry } from '../../utils/stories';
import Avatar from '../profile/Avatar';
import { getMyAvatar } from '../../utils/chatMeta';

export interface StoriesRailProps {
  onOpenTray: (entries: StoryTrayEntry[], index: number) => void;
  onCreate: () => void;
  /** bumped by the shell so the tray re-hydrates after sends/creates */
  refreshKey?: number;
}

/**
 * Instagram-style stories tray at the top of the inbox:
 *   [Your story +] [alice ○] [bob ●] …
 * Data is fetched from the `stories` table through RLS — anything the
 * viewer can't see (expired, private, close-friends) never arrives.
 */
export const StoriesRail: React.FC<StoriesRailProps> = ({ onOpenTray, onCreate, refreshKey = 0 }) => {
  const { account, myGradient } = useCrypto();
  const [tray, setTray] = useState<StoryTrayEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !account) {
      setTray([]);
      return;
    }
    setLoading(true);
    try {
      const following = await fetchFollowing(supabase, account.username);
      const entries = await fetchStoryTray(supabase, account.username, following);
      setTray(entries.filter(e => e.stories.length > 0));
    } catch {
      setTray([]);
    } finally {
      setLoading(false);
    }
  }, [account?.username]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  if (!account) return null;

  const mine = tray.find(e => e.username === account.username);
  const others = tray.filter(e => e.username !== account.username);

  return (
    <div className="shrink-0 border-b border-white/[0.06] bg-[#07070d]/60">
      <div className="flex items-center gap-3.5 px-3 py-3 overflow-x-auto feed-scroll" data-testid="stories-tray">
        {/* Your story — create or view your own */}
        <button
          type="button"
          onClick={() => (mine ? onOpenTray(tray, tray.indexOf(mine)) : onCreate())}
          className="flex flex-col items-center gap-1.5 shrink-0 w-[64px] group"
          title={mine ? 'View your story' : 'Add to your story'}
        >
          <div className="relative">
            <Avatar
              seed={account.username}
              name={`@${account.username}`}
              size={56}
              gradient={myGradient || getMyAvatar(account.username) || undefined}
              ring={mine ? 'story' : 'none'}
              src={(account as any).avatar_url || undefined}
            />
            {!mine && (
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-cyan-500 border-2 border-[#04050a] flex items-center justify-center">
                <Plus className="w-3 h-3 text-black" strokeWidth={3} />
              </span>
            )}
          </div>
          <span className="text-[10px] text-zinc-400 truncate w-full text-center group-hover:text-white transition-colors">
            Your story
          </span>
        </button>

        {/* Other people's stories */}
        {others.map(entry => (
          <button
            key={entry.username}
            type="button"
            onClick={() => onOpenTray(tray, tray.indexOf(entry))}
            className="flex flex-col items-center gap-1.5 shrink-0 w-[64px] group"
            title={`@${entry.username}'s story`}
          >
            <div className="relative">
              <StoryAvatar username={entry.username} size={56} ring={entry.unseen ? 'story' : 'seen'} />
            </div>
            <span className={`text-[10px] truncate w-full text-center transition-colors ${entry.unseen ? 'text-white' : 'text-zinc-500'} group-hover:text-white`}>
              @{entry.username.length > 9 ? `${entry.username.slice(0, 9)}…` : entry.username}
            </span>
          </button>
        ))}

        {!loading && others.length === 0 && (
          <div className="text-[10px] text-zinc-600 px-1 leading-tight">
            Stories from people you follow appear here.
          </div>
        )}
      </div>
    </div>
  );
};

/** Avatar that resolves the profile photo (avatar_url) or gradient. */
export const StoryAvatar: React.FC<{ username: string; size?: number; ring?: 'story' | 'seen' | 'none' }> = ({
  username,
  size = 56,
  ring = 'none',
}) => {
  const [src, setSrc] = useState<string | null>(null);
  const [gradient, setGradient] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, avatar_gradient')
        .eq('username', username.trim().toLowerCase())
        .maybeSingle();
      if (!alive) return;
      setSrc(data?.avatar_url || null);
      setGradient(data?.avatar_gradient || undefined);
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [username]);
  return <Avatar seed={username} name={`@${username}`} size={size} ring={ring} src={src} gradient={gradient} />;
};

export default StoriesRail;

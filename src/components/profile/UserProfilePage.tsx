import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Settings, Grid3X3, Lock, MessageCircle, UserCheck, UserX, MoreHorizontal,
  Camera, Trash2, Ban, UserMinus, Loader2, Play, X, ChevronRight, Users,
} from 'lucide-react';
import { supabase } from '../../contexts/CryptoContext';
import {
  fetchAccount, fetchFollowState, followUser, unfollowUser, fetchFollowers,
  fetchFollowing, fetchAccountsByUsernames, fetchFollowRequests, fetchBlockedUsers,
  removeFollower, blockUser, unblockUser,
  updateAccountProfile, uploadAvatar, removeAvatar,
  type Account, type FollowState,
} from '../../utils/auth';
import {
  fetchUserStories, fetchHighlights, createHighlight, deleteHighlight,
  setCloseFriend, fetchCloseFriends, storyMediaUrl,
  type Story, type Highlight,
} from '../../utils/stories';
import Avatar from './Avatar';
import SecurityNote from '../ui/SecurityNote';

export interface UserProfilePageProps {
  username: string;
  isMe: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  /** open the story viewer with these stories starting at index */
  onOpenStory: (stories: Story[], index: number) => void;
  onMessage: (username: string) => Promise<{ ok: boolean; error?: string }>;
}

const GRADIENT_CHOICES = [
  'linear-gradient(135deg,#0ea5e9,#22d3ee)',
  'linear-gradient(135deg,#10b981,#34d399)',
  'linear-gradient(135deg,#6366f1,#818cf8)',
  'linear-gradient(135deg,#ec4899,#f472b6)',
  'linear-gradient(135deg,#f59e0b,#fbbf24)',
  'linear-gradient(135deg,#ef4444,#f87171)',
  'linear-gradient(135deg,#14b8a6,#2dd4bf)',
  'linear-gradient(135deg,#a855f7,#c084fc)',
];

/**
 * Full Instagram-style profile page (Axon theme), routed at /profile/:username:
 * avatar (uploaded photo or gradient), stats with follower/following lists,
 * follow / request / message actions, block, remove-follower, close-friends,
 * active stories + highlights. Everything persists through RLS-guarded tables.
 */
export const UserProfilePage: React.FC<UserProfilePageProps> = ({
  username,
  isMe,
  onBack,
  onOpenSettings,
  onOpenStory,
  onMessage,
}) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followState, setFollowState] = useState<FollowState>({ following: false, requested: false, followsMe: false });
  const [followers, setFollowers] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [stories, setStories] = useState<Story[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [closeFriends, setCloseFriends] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listModal, setListModal] = useState<'followers' | 'following' | null>(null);
  const [listAccounts, setListAccounts] = useState<Account[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editGradient, setEditGradient] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [busy, setBusy] = useState('');
  const [msgError, setMsgError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [listFollowMap, setListFollowMap] = useState<Record<string, FollowState>>({});
  const navigate = useNavigate();
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const me = (() => {
    try {
      return (JSON.parse(localStorage.getItem('axon_session') || '{}').username || '').trim().toLowerCase();
    } catch {
      return '';
    }
  })();

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    try {
      const acc = await fetchAccount(supabase, username);
      if (!acc) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setAccount(acc);
      setEditName(acc.display_name || '');
      setEditBio(acc.bio || '');
      setEditGradient(acc.avatar_gradient || '');
      const [fs, fol, fwing, hs] = await Promise.all([
        fetchFollowState(supabase, me || username, username),
        fetchFollowers(supabase, username),
        fetchFollowing(supabase, username),
        fetchUserStories(supabase, username),
      ]);
      setFollowState(fs);
      setFollowers(fol);
      setFollowing(fwing);
      setStories(hs.filter(s => !s.expires_at || new Date(s.expires_at).getTime() > Date.now() || isMe));
      setHighlights(await fetchHighlights(supabase, username));
      if (isMe) {
        const reqs = await fetchFollowRequests(supabase, username);
        setPendingCount(reqs.length);
        // blocked list check (my own blocklist)
        setBlocked((await fetchBlockedUsers(supabase, username)).includes(me));
      } else if (me) {
        // did I block them? (my_blocklist RPC → fetchBlockedUsers covers v2+v1)
        setBlocked((await fetchBlockedUsers(supabase, me)).includes(username.trim().toLowerCase()));
      }
      // my Close Friends list (drives the "Add to Close Friends" toggle + list chips)
      if (me) setCloseFriends(await fetchCloseFriends(supabase, me));
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [username, isMe, me]);

  useEffect(() => {
    load();
  }, [load]);

  /* ------------------------------ actions ------------------------------ */

  const toggleFollow = async () => {
    if (!supabase || !account || !me) return;
    setBusy('follow');
    const st = followState;
    if (st.following || st.requested) {
      await unfollowUser(supabase, me, account.username);
      setFollowState({ ...st, following: false, requested: false });
    } else {
      const status = await followUser(supabase, me, account.username, account.is_private === true);
      setFollowState({ ...st, following: status === 'active', requested: status === 'pending' });
      if (status === 'pending') flash('Follow request sent');
    }
    setBusy('');
    load();
  };

  const handleMessage = async () => {
    if (!account) return;
    setMsgError(null);
    setBusy('message');
    const res = await onMessage(account.username);
    setBusy('');
    if (!res.ok) setMsgError(res.error || 'Could not start the chat.');
  };

  const handleBlock = async () => {
    if (!supabase || !account || !me) return;
    if (blocked) {
      await unblockUser(supabase, me, account.username);
      setBlocked(false);
      flash('Unblocked');
    } else {
      await blockUser(supabase, me, account.username);
      setBlocked(true);
      flash('Blocked — they can no longer find or message you');
    }
    setMenuOpen(false);
  };

  const saveEdit = async () => {
    if (!supabase || !account) return;
    setSavingEdit(true);
    await updateAccountProfile(supabase, account.username, {
      display_name: editName.trim().slice(0, 40),
      bio: editBio.trim().slice(0, 160),
      avatar_gradient: editGradient,
    });
    setSavingEdit(false);
    setEditOpen(false);
    flash('Profile updated');
    load();
  };

  const handleAvatarPick = async (file: File | null) => {
    if (!file || !supabase || !account) return;
    setUploadingAvatar(true);
    const res = await uploadAvatar(supabase, account.username, file);
    setUploadingAvatar(false);
    if (!res.ok) {
      flash(res.error);
      return;
    }
    flash('Profile photo updated');
    load();
  };

  const handleRemoveAvatar = async () => {
    if (!supabase || !account) return;
    await removeAvatar(supabase, account.username);
    flash('Profile photo removed');
    load();
  };

  /* ------------------------------ lists ------------------------------ */

  const openList = async (which: 'followers' | 'following') => {
    if (!supabase || !account) return;
    setListModal(which);
    setListLoading(true);
    const usernames = which === 'followers' ? followers : following;
    setListAccounts(await fetchAccountsByUsernames(supabase, usernames));
    setListLoading(false);
  };

  const removeFollowerRow = async (uname: string) => {
    if (!supabase || !account) return;
    await removeFollower(supabase, account.username, uname);
    setFollowers(prev => prev.filter(f => f !== uname));
    setListAccounts(prev => prev.filter(a => a.username !== uname));
    flash(`Removed @${uname}`);
  };

  const toggleCloseFriend = async (uname: string) => {
    if (!supabase || !account) return;
    const add = !closeFriends.includes(uname);
    await setCloseFriend(supabase, account.username, uname, add);
    setCloseFriends(prev => (add ? [...prev, uname] : prev.filter(x => x !== uname)));
    flash(add ? `@${uname} added to Close Friends` : `@${uname} removed from Close Friends`);
  };

  const listToggleFollow = async (acc: Account) => {
    if (!supabase || !me) return;
    const current = (listFollowMap[acc.username]) || { following: false, requested: false, followsMe: false };
    if (current.following || current.requested) {
      await unfollowUser(supabase, me, acc.username);
      setListFollowMap(prev => ({ ...prev, [acc.username]: { ...current, following: false, requested: false } }));
    } else {
      const status = await followUser(supabase, me, acc.username, acc.is_private === true);
      setListFollowMap(prev => ({
        ...prev,
        [acc.username]: { ...current, following: status === 'active', requested: status === 'pending' },
      }));
    }
  };

  useEffect(() => {
    if (!listModal || !supabase || !me) return;
    (async () => {
      const pairs = await Promise.all(
        listAccounts.map(async a => ({ u: a.username, s: await fetchFollowState(supabase, me, a.username) }))
      );
      setListFollowMap(prev => {
        const next = { ...prev };
        pairs.forEach(p => { next[p.u] = p.s; });
        return next;
      });
    })();
  }, [listModal, listAccounts, me]);

  /* ------------------------------ render ------------------------------ */

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[10px] tracking-widest uppercase text-zinc-600">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading profile…
      </div>
    );
  }

  if (notFound || !account) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
        <UserX className="w-10 h-10 text-zinc-700" />
        <p className="text-white font-bold">User not found</p>
        <p className="text-zinc-500 text-sm max-w-xs"> @{username} doesn't exist, or their account is gone.</p>
        <button onClick={onBack} className="btn-premium px-6 py-2.5 rounded-lg text-xs mt-2">Back to messages</button>
      </div>
    );
  }

  const displayName = account.display_name?.trim() || `@${account.username}`;
  const storyRing = stories.length > 0 ? 'story' : 'none';

  return (
    <div className="h-full flex flex-col bg-[#07070d]/80 relative" data-testid="user-profile">
      {/* header */}
      <header className="shrink-0 flex items-center gap-3 px-3 sm:px-4 h-[56px] border-b border-white/[0.06]">
        <button onClick={onBack} className="p-1.5 text-zinc-400 hover:text-white" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-white font-bold text-sm tracking-wide flex-1 truncate">
          {isMe ? 'Your profile' : displayName}
        </span>
        {isMe ? (
          <>
            <button onClick={onOpenSettings} className="p-1.5 text-zinc-400 hover:text-white" aria-label="Settings">
              <Settings className="w-5 h-5" />
            </button>
          </>
        ) : (
          <div className="relative">
            <button onClick={() => setMenuOpen(m => !m)} className="p-1.5 text-zinc-400 hover:text-white" aria-label="More options">
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 term-panel rounded-xl border border-white/10 py-1 w-48 shadow-2xl z-40">
                <button
                  onClick={handleBlock}
                  className="w-full text-left px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                >
                  <Ban className="w-3.5 h-3.5" /> {blocked ? 'Unblock' : 'Block'}
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto feed-scroll">
        {/* identity row */}
        <div className="flex items-center gap-5 sm:gap-8 px-4 sm:px-6 py-6">
          <button
            type="button"
            onClick={() => (isMe ? avatarInputRef.current?.click() : stories.length > 0 && onOpenStory(stories, 0))}
            className="relative shrink-0"
            title={isMe ? 'Change profile photo' : stories.length > 0 ? 'View story' : undefined}
          >
            <Avatar
              seed={account.username}
              name={displayName}
              size={80}
              ring={storyRing}
              src={account.avatar_url || undefined}
              gradient={account.avatar_gradient || undefined}
            />
            {isMe && (
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-cyan-500 border-2 border-[#04050a] flex items-center justify-center">
                <Camera className="w-3.5 h-3.5 text-black" />
              </span>
            )}
            {uploadingAvatar && (
              <span className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-300" />
              </span>
            )}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => handleAvatarPick(e.target.files?.[0] || null)}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-white font-bold text-lg truncate">{displayName}</h1>
              {account.is_private && (
                <span className="text-[8px] font-bold tracking-[0.2em] uppercase text-amber-300 border border-amber-400/30 bg-amber-400/10 rounded px-1.5 py-0.5">
                  Private
                </span>
              )}
              {followState.followsMe && !isMe && (
                <span className="text-[8px] font-bold tracking-[0.2em] uppercase text-zinc-400 border border-white/10 rounded px-1.5 py-0.5">
                  Follows you
                </span>
              )}
            </div>
            <p className="text-zinc-500 text-sm mt-0.5">@{account.username}</p>

            {/* stats */}
            <div className="flex items-center gap-5 sm:gap-7 mt-3 text-sm">
              <button onClick={() => (stories.length > 0 || highlights.length > 0) && (stories.length > 0 ? onOpenStory(stories, 0) : highlights[0]?.stories && onOpenStory(highlights[0].stories, 0))} className="text-center hover:text-white transition-colors">
                <span className="block text-white font-bold">{stories.length + highlights.reduce((n, h) => n + (h.stories?.length || 0), 0)}</span>
                <span className="block text-[10px] text-zinc-500 uppercase tracking-wider">Stories</span>
              </button>
              <button onClick={() => openList('followers')} className="text-center hover:text-white transition-colors">
                <span className="block text-white font-bold">{followers.length}</span>
                <span className="block text-[10px] text-zinc-500 uppercase tracking-wider">Followers</span>
              </button>
              <button onClick={() => openList('following')} className="text-center hover:text-white transition-colors">
                <span className="block text-white font-bold">{following.length}</span>
                <span className="block text-[10px] text-zinc-500 uppercase tracking-wider">Following</span>
              </button>
            </div>
          </div>
        </div>

        {/* bio */}
        <BioLinks bio={account.bio} />

        {/* actions */}
        <div className="px-4 sm:px-6 mt-4 flex items-center gap-2 flex-wrap">
          {isMe ? (
            <>
              <button onClick={() => setEditOpen(true)} className="btn-premium px-5 py-2 rounded-lg text-xs flex-1 min-w-[120px]">
                Edit profile
              </button>
              {account.avatar_url && (
                <button
                  onClick={handleRemoveAvatar}
                  className="term-panel term-interactive px-4 py-2 rounded-lg text-xs text-zinc-300 border border-white/[0.07] flex items-center gap-1.5 hover:text-red-300"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove photo
                </button>
              )}
              {pendingCount > 0 && (
                <button
                  onClick={openListFollowRequests}
                  className="term-panel term-interactive px-4 py-2 rounded-lg text-xs text-amber-300 border border-amber-400/30 flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5" /> {pendingCount} follow request{pendingCount === 1 ? '' : 's'}
                </button>
              )}
            </>
          ) : blocked ? (
            <button onClick={handleBlock} className="term-panel term-interactive px-5 py-2 rounded-lg text-xs text-zinc-300 border border-white/[0.07]">
              Unblock
            </button>
          ) : (
            <>
              <button
                onClick={toggleFollow}
                disabled={busy === 'follow'}
                className={`px-5 py-2 rounded-lg text-xs min-w-[110px] font-bold tracking-wide transition-all ${
                  followState.following
                    ? 'border border-white/10 text-zinc-300 hover:border-white/25'
                    : followState.requested
                      ? 'border border-amber-400/40 text-amber-300 hover:bg-amber-400/10'
                      : 'btn-premium'
                }`}
              >
                {busy === 'follow' ? '…' : followState.following ? 'Following' : followState.requested ? 'Requested' : 'Follow'}
              </button>
              <button
                onClick={handleMessage}
                disabled={busy === 'message'}
                className="px-4 py-2 rounded-lg text-xs border border-cyan-400/40 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-400/20 flex items-center gap-1.5 font-bold tracking-wide"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {busy === 'message' ? '…' : 'Message'}
              </button>
              {followState.following && !isMe && (
                <button
                  onClick={() => toggleCloseFriend(account.username)}
                  className={`px-4 py-2 rounded-lg text-xs border flex items-center gap-1.5 ${
                    closeFriends.includes(account.username)
                      ? 'border-emerald-400/50 text-emerald-300 bg-emerald-400/10'
                      : 'border-white/[0.08] text-zinc-400 hover:border-emerald-400/30'
                  }`}
                  title="Close Friends can see your close-friends-only stories"
                >
                  <UserCheck className="w-3.5 h-3.5" /> {closeFriends.includes(account.username) ? 'Close Friend ✓' : 'Add to Close Friends'}
                </button>
              )}
            </>
          )}
        </div>

        {msgError && (
          <div className="mx-4 sm:mx-6 mt-2 p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">{msgError}</div>
        )}

        {/* private lock */}
        {!isMe && account.is_private && !followState.following && !blocked && (
          <div className="mx-4 sm:mx-6 mt-6 border border-white/[0.07] rounded-2xl p-8 text-center">
            <Lock className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-white font-bold text-sm">This account is private</p>
            <p className="text-zinc-500 text-xs mt-1 max-w-xs mx-auto leading-relaxed">
              Follow this account to see their stories and highlights.
            </p>
          </div>
        )}

        {/* blocked notice */}
        {blocked && !isMe && (
          <div className="mx-4 sm:mx-6 mt-6 border border-red-500/30 bg-red-500/[0.06] rounded-2xl p-6 text-center">
            <Ban className="w-7 h-7 text-red-400 mx-auto mb-2" />
            <p className="text-red-300 text-sm font-bold">You've blocked @{account.username}</p>
            <p className="text-zinc-500 text-xs mt-1">They can't find your profile, follow you, or message you. Unblock to change that.</p>
          </div>
        )}

        {/* highlights */}
        {isMe && (
          <div className="px-4 sm:px-6 mt-6">
            <button
              onClick={() => createHighlightFromStories()}
              disabled={stories.length === 0}
              className="w-full border border-dashed border-white/15 rounded-2xl p-4 flex items-center gap-3 text-left disabled:opacity-40 hover:border-cyan-400/40 transition-colors"
            >
              <span className="w-11 h-11 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0">
                <Grid3X3 className="w-5 h-5 text-cyan-300" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs text-white font-bold">New highlight</span>
                <span className="block text-[10px] text-zinc-500 leading-tight">
                  {stories.length > 0 ? `Save your ${stories.length} active stor${stories.length === 1 ? 'y' : 'ies'} to your profile for good` : 'Share a story first, then save it here'}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </button>
          </div>
        )}
        {highlights.length > 0 && (
          <div className="px-4 sm:px-6 mt-4">
            <h3 className="text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-2">Highlights</h3>
            <div className="flex gap-3 overflow-x-auto feed-scroll pb-1">
              {highlights.map(h => (
                <div key={h.id} className="relative shrink-0 group">
                  <button
                    type="button"
                    onClick={() => h.stories && h.stories.length > 0 && onOpenStory(h.stories, 0)}
                    className="flex flex-col items-center gap-1.5 w-[72px]"
                    title={`Highlight: ${h.title}`}
                  >
                    <span className="w-[62px] h-[62px] rounded-full border border-white/15 p-0.5 block">
                      <HighlightCover coverPath={h.cover_path} fallbackGradient={account.avatar_gradient} seed={h.id} />
                    </span>
                    <span className="text-[10px] text-zinc-300 truncate w-full text-center">{h.title}</span>
                  </button>
                  {isMe && (
                    <button
                      onClick={async () => {
                        await deleteHighlight(supabase, h.id);
                        setHighlights(prev => prev.filter(x => x.id !== h.id));
                        flash('Highlight deleted');
                      }}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/80 border border-white/20 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      aria-label={`Delete highlight ${h.title}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* stories grid */}
        {stories.length > 0 && (!account.is_private || isMe || followState.following) && (
          <div className="px-4 sm:px-6 mt-5 pb-6">
            <h3 className="text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-2 flex items-center gap-1.5">
              <Play className="w-3 h-3" /> Active stories · expire in 24h
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1.5">
              {stories.map((s, i) => (
                <StoryTile key={s.id} story={s} onClick={() => onOpenStory(stories, i)} />
              ))}
            </div>
          </div>
        )}

        <div className="px-4 sm:px-6 pb-8">
          <SecurityNote compact className="w-full" />
        </div>
      </div>

      {/* toast */}
      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 term-panel border border-cyan-400/30 rounded-full px-4 py-2 text-xs text-cyan-200 shadow-2xl">
          {toast}
        </div>
      )}

      {/* followers / following modal */}
      {listModal && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setListModal(null); }}>
          <div className="term-panel rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden border border-white/10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-white font-bold text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-300" />
                {listModal === 'followers' ? `Followers · ${followers.length}` : `Following · ${following.length}`}
              </span>
              <button onClick={() => setListModal(null)} className="text-zinc-400 hover:text-white" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto feed-scroll flex-1 p-2">
              {listLoading && <div className="py-10 text-center text-[10px] tracking-widest uppercase text-zinc-600">Loading…</div>}
              {!listLoading && listAccounts.length === 0 && (
                <p className="text-zinc-600 text-xs text-center py-10">
                  {listModal === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
                </p>
              )}
              {listAccounts.map(acc => {
                const lf = listFollowMap[acc.username];
                const isCF = closeFriends.includes(acc.username);
                return (
                  <div key={acc.id} className="flex items-center gap-2.5 px-2 py-2 hover:bg-white/[0.04] rounded-xl">
                    <button type="button" onClick={() => { setListModal(null); navigate(`/profile/${encodeURIComponent(acc.username)}`); }} className="shrink-0" title={`Open @${acc.username}`}>
                      <Avatar seed={acc.username} name={`@${acc.username}`} size={38} src={acc.avatar_url || undefined} gradient={acc.avatar_gradient || undefined} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-semibold truncate">@{acc.username}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{acc.display_name?.trim() || acc.bio?.trim() || ''}</div>
                    </div>
                    {isMe && listModal === 'followers' && (
                      <>
                        <button
                          onClick={() => toggleCloseFriend(acc.username)}
                          className={`shrink-0 text-[9px] font-bold tracking-widest uppercase px-2.5 py-1.5 rounded-lg border transition-colors ${
                            isCF ? 'border-emerald-400/50 text-emerald-300 bg-emerald-400/10' : 'border-white/10 text-zinc-400'
                          }`}
                          title="Close Friends can see close-friends-only stories"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeFollowerRow(acc.username)}
                          className="shrink-0 text-[9px] font-bold tracking-widest uppercase px-2.5 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-red-300"
                          title="Remove this follower"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {!isMe && (
                      <button
                        onClick={() => listToggleFollow(acc)}
                        className={`shrink-0 text-[9px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border ${
                          lf?.following || lf?.requested
                            ? 'border-white/10 text-zinc-300'
                            : 'border-cyan-400/40 text-cyan-200 bg-cyan-500/10'
                        }`}
                      >
                        {lf?.following ? 'Following' : lf?.requested ? 'Requested' : 'Follow'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* edit profile modal */}
      {editOpen && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setEditOpen(false); }}>
          <div className="term-panel rounded-2xl w-full max-w-md p-5 border border-white/10 relative">
            <button onClick={() => setEditOpen(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-white font-bold text-lg mb-1">Edit profile</h3>
            <p className="text-zinc-500 text-xs mb-4">Changes save to your account and show everywhere.</p>

            <label className="block text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-1.5">Name</label>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              maxLength={40}
              placeholder="How should people see you?"
              className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500/60 mb-3"
            />
            <label className="block text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-1.5">Bio</label>
            <textarea
              value={editBio}
              onChange={e => setEditBio(e.target.value)}
              maxLength={160}
              rows={3}
              placeholder="A little about you (links are clickable)"
              className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500/60 resize-none mb-3"
            />
            <label className="block text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-1.5">Avatar color</label>
            <div className="flex gap-2 flex-wrap mb-4">
              {GRADIENT_CHOICES.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setEditGradient(g)}
                  aria-label="Avatar gradient"
                  className={`w-8 h-8 rounded-full border-2 transition-all ${editGradient === g ? 'border-cyan-300 scale-110' : 'border-white/20'}`}
                  style={{ background: g }}
                />
              ))}
            </div>
            <button onClick={saveEdit} disabled={savingEdit} className="btn-premium w-full py-2.5 rounded-lg text-xs disabled:opacity-50">
              {savingEdit ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  /* open my pending follow-requests list (reuse followers modal with requests) */
  async function openListFollowRequests() {
    if (!supabase || !account) return;
    const reqs = await fetchFollowRequests(supabase, account.username);
    setListModal('followers');
    setListLoading(true);
    setListAccounts(await fetchAccountsByUsernames(supabase, reqs));
    setListLoading(false);
  }

  /* save all active stories into one new highlight */
  async function createHighlightFromStories() {
    if (!supabase || !account || stories.length === 0) return;
    const res = await createHighlight(supabase, account.username, `Stories ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`, stories.map(s => s.id), stories[0].media_path);
    if (res.ok) {
      flash('Stories saved to a new highlight');
      load();
    } else {
      flash(res.error || 'Could not create the highlight.');
    }
  }
};

/* ---------- small pieces ---------- */

const BioLinks: React.FC<{ bio: string }> = ({ bio }) => {
  if (!bio?.trim()) return null;
  const parts = bio.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className="px-4 sm:px-6 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:underline break-all">
            {p}
          </a>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </p>
  );
};

const HighlightCover: React.FC<{ coverPath: string; fallbackGradient?: string; seed: string }> = ({ coverPath, fallbackGradient, seed }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (coverPath) {
      storyMediaUrl(supabase, coverPath).then(u => { if (alive) setUrl(u); }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [coverPath]);
  return (
    <span className="w-full h-full rounded-full overflow-hidden block bg-[#0b0d14]">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full block" style={{ background: fallbackGradient || 'linear-gradient(135deg,#164e63,#0f172a)' }} data-seed={seed} />
      )}
    </span>
  );
};

const StoryTile: React.FC<{ story: Story; onClick: () => void }> = ({ story, onClick }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    storyMediaUrl(supabase, story.media_path)
      .then(u => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [story.media_path]);
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-[9/14] rounded-xl overflow-hidden bg-[#0b0d14] border border-white/[0.06] hover:border-cyan-400/50 transition-colors group"
      title="View story"
    >
      {url && story.media_type === 'image' && <img src={url} alt="" className="w-full h-full object-cover" />}
      {url && story.media_type === 'video' && (
        <>
          <video src={url} muted playsInline className="w-full h-full object-cover" />
          <Play className="absolute inset-0 m-auto w-6 h-6 text-white/90" />
        </>
      )}
      {!url && !err && <span className="absolute inset-0 animate-pulse bg-white/[0.03]" />}
      {story.audience === 'close_friends' && (
        <span className="absolute top-1.5 left-1.5 text-[8px] font-bold tracking-widest uppercase text-emerald-300 bg-black/70 border border-emerald-400/30 rounded px-1 py-0.5">
          Close friends
        </span>
      )}
    </button>
  );
};

export default UserProfilePage;

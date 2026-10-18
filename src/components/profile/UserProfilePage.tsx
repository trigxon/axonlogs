import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Settings, Lock, MessageCircle, UserCheck, UserX, MoreHorizontal,
  Camera, Trash2, Ban, UserMinus, Loader2, X, Users,
} from 'lucide-react';
import { supabase } from '../../contexts/CryptoContext';
import {
  fetchAccount, fetchFollowState, followUser, unfollowUser, fetchFollowers,
  fetchFollowing, fetchAccountsByUsernames, fetchFollowRequests, fetchBlockedUsers,
  removeFollower, blockUser, unblockUser,
  updateAccountProfile, uploadAvatar, removeAvatar,
  type Account, type FollowState,
} from '../../utils/auth';
import Avatar from './Avatar';
import SecurityNote from '../ui/SecurityNote';

export interface UserProfilePageProps {
  username: string;
  isMe: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
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
 * follow / request / message actions, block, remove-follower. Everything
 * persists through RLS-guarded tables.
 */
export const UserProfilePage: React.FC<UserProfilePageProps> = ({
  username,
  isMe,
  onBack,
  onOpenSettings,
  onMessage,
}) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followState, setFollowState] = useState<FollowState>({ following: false, requested: false, followsMe: false });
  const [followers, setFollowers] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
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
      const [fs, fol, fwing] = await Promise.all([
        fetchFollowState(supabase, me || username, username),
        fetchFollowers(supabase, username),
        fetchFollowing(supabase, username),
      ]);
      setFollowState(fs);
      setFollowers(fol);
      setFollowing(fwing);
      if (isMe) {
        const reqs = await fetchFollowRequests(supabase, username);
        setPendingCount(reqs.length);
        // blocked list check (my own blocklist)
        setBlocked((await fetchBlockedUsers(supabase, username)).includes(me));
      } else if (me) {
        // did I block them? (my_blocklist RPC → fetchBlockedUsers covers v2+v1)
        setBlocked((await fetchBlockedUsers(supabase, me)).includes(username.trim().toLowerCase()));
      }
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
            onClick={() => isMe && avatarInputRef.current?.click()}
            className="relative shrink-0"
            title={isMe ? 'Change profile photo' : undefined}
          >
            <Avatar
              seed={account.username}
              name={displayName}
              size={80}
              ring="none"
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
              Follow this account to unlock messaging and see their full profile.
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

export default UserProfilePage;

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  MessageCircle, Settings as SettingsIcon, X, KeyRound, Users,
  ToggleRight, ToggleLeft, Lock, Search, Heart, Compass,
} from 'lucide-react';
import { useCrypto, supabase, type Chat } from '../../contexts/CryptoContext';
import {
  dmDisplayName, fetchFollowState, followUser, unfollowUser,
  fetchFollowing, fetchAccountsByUsernames, type Account, type FollowState,
} from '../../utils/auth';
import { isChatMuted } from '../../utils/chatMeta';
import { syncChatLockRuntime } from '../../utils/chatLock';
import {
  isPrivacyLocked, lockAllConversations,
  getChatLockEnabledState, chatLockProtectedIds, getAutoLockOnHide,
} from '../../utils/chatLockCore';
import { fetchUnreadCount } from '../../utils/notifications';
import InboxPanel from '../chat/InboxPanel';
import ConversationPanel from '../chat/ConversationPanel';
import ProfilePanel from '../profile/ProfilePanel';
import Avatar from '../profile/Avatar';
import CallOverlay, { IncomingCallScreen } from '../calling/CallOverlay';
import SecurityNote from '../ui/SecurityNote';
import NotificationsPanel from '../notifications/NotificationsPanel';
import ExplorePanel from '../search/ExplorePanel';
import UserProfilePage from '../profile/UserProfilePage';
import ResetPasswordPanel from '../auth/ResetPasswordPanel';
import KeyringGate from '../auth/KeyringGate';
import AdminPanel from '../admin/AdminPanel';

const SettingsPanel = lazy(() => import('../settings/SettingsPanel'));

type Pane = 'chat' | 'profile' | 'settings' | 'explore' | 'notifications' | 'user' | 'reset' | 'admin' | 'notfound';

let audioCtx: AudioContext | null = null;
const playPing = () => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.18);
  } catch {
    /* audio unavailable */
  }
};

const generateEasyPasscode = () => `AXON-${Math.floor(1000 + Math.random() * 9000)}`;

export const ChatApp: React.FC = () => {
  const {
    deviceId, alias, chats, activeChat, setActiveChat, messages,
    createChat, joinChat, renameChat, changeChatPassword, createGroupChat, searchAccounts,
    startDmWithUser,
    unlockedChatId, unlockChat, settings, backendMode, myGradient,
    latency, typingUsers, onlineUsers, account,
    bumpMessagesReload, scrubConversation,
  } = useCrypto();

  /* ---------------- Chat Lock (Phase 4) controller ----------------
   * Server state (chat_lock_settings + conversation_locks) is synced
   * into the in-memory runtime; this tab's unlock set dies on refresh,
   * and every route change / tab hide re-locks protected conversations. */
  const [lockTick, setLockTick] = useState(0);
  const [chatLockOn, setChatLockOn] = useState(false);
  const [protectedIds, setProtectedIds] = useState<Set<string>>(() => new Set());
  const bumpLock = () => setLockTick(t => t + 1);
  const lockRoute = useLocation();

  const resyncChatLock = React.useCallback(async () => {
    await syncChatLockRuntime();
    setChatLockOn(getChatLockEnabledState());
    setProtectedIds(new Set(chatLockProtectedIds()));
    bumpLock();
  }, []);

  // Sync on sign-in / account change.
  React.useEffect(() => {
    if (!account?.username) return;
    resyncChatLock();
  }, [account?.username, resyncChatLock]);

  // Lock everything protected: tab hide, page hide, settings changes.
  const lockAllNow = React.useCallback(() => {
    const ids = lockAllConversations();
    if (!ids.length) return;
    ids.forEach(id => scrubConversation(id));
    bumpLock();
  }, [scrubConversation]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && getAutoLockOnHide()) lockAllNow();
    };
    const onPageHide = () => lockAllNow();
    const onLockChanged = () => { resyncChatLock(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('axon:chat-lock-changed', onLockChanged);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('axon:chat-lock-changed', onLockChanged);
    };
  }, [lockAllNow, resyncChatLock]);

  // Any route change re-locks protected conversations (deep links too).
  const firstRoute = React.useRef(true);
  React.useEffect(() => {
    if (firstRoute.current) { firstRoute.current = false; return; }
    lockAllNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockRoute.pathname]);

  /* ---------------- navigation (URL-routed) ---------------- */
  const location = useLocation();
  const navigate = useNavigate();
  const paneFromPath = (): Pane => {
    const p = location.pathname;
    if (p === '/' || p.startsWith('/direct')) return 'chat';
    if (p.startsWith('/explore')) return 'explore';
    if (p.startsWith('/notifications')) return 'notifications';
    if (p === '/profile' || p.startsWith('/profile/')) {
      const rest = p.slice('/profile'.length).replace(/^\/+/, '');
      return rest ? 'user' : 'profile';
    }
    if (p.startsWith('/settings')) return 'settings';
    if (p.startsWith('/reset')) return 'reset';
    if (p.startsWith('/admin')) return 'admin';
    return 'notfound';
  };
  const [pane, setPane] = useState<Pane>(paneFromPath);
  const [mobileView, setMobileView] = useState<'inbox' | 'chat' | Pane>('inbox');
  const [refreshKey, setRefreshKey] = useState(0);

  // URL is the source of truth: rail/nav taps navigate, back/forward work,
  // and deep links (/profile/someone, /direct/t/<chat-id>) open directly.
  useEffect(() => {
    const p = paneFromPath();
    setPane(p);
    if (p === 'chat') {
      const m = location.pathname.match(/^\/direct\/t\/([\w-]+)/);
      if (m) {
        const target = chats.find(c => c.id === m[1]);
        if (target) {
          setActiveChat(target);
          setMobileView('chat');
        }
      } else {
        setMobileView(mv => (mv === 'chat' && activeChat ? 'chat' : 'inbox'));
      }
    } else {
      setMobileView(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, chats.length]);

  const go = (to: string) => navigate(to);
  const openProfileAt = (username?: string) => navigate(username ? `/profile/${encodeURIComponent(username)}` : '/profile');

  /* ---------------- unread notifications badge ---------------- */
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  useEffect(() => {
    if (backendMode !== 'online' || !supabase || !account) {
      setUnreadNotifs(0);
      return;
    }
    let alive = true;
    const load = () =>
      fetchUnreadCount(supabase, account.username)
        .then(c => { if (alive) setUnreadNotifs(c); })
        .catch(() => undefined);
    load();
    const t = setInterval(load, 45000);
    let channel: any = null;
    try {
      channel = supabase
        .channel(`notif-${account.username}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `username=eq.${account.username}` }, () => load())
        .subscribe();
    } catch {
      /* realtime unavailable — polling covers it */
    }
    return () => {
      alive = false;
      clearInterval(t);
      try { if (channel) supabase?.removeChannel(channel); } catch { /* noop */ }
    };
  }, [backendMode, account?.username]);

  /* ---------------- security screens ---------------- */
  const [panicMode, setPanicMode] = useState(false);
  const [isDecoyMode, setIsDecoyMode] = useState(false);
  const [decoyPassphrase] = useState(() => localStorage.getItem('axon_decoy_pass') || 'DECOY123');
  const [tabHidden, setTabHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const stealthActive = settings.stealthMode && tabHidden;
  const [isIdleLocked, setIsIdleLocked] = useState(false);
  const idleTimeoutRef = useRef<any>(null);
  const [keystrokeTimings, setKeystrokeTimings] = useState<number[]>([]);
  const lastKeyTimeRef = useRef<number>(0);
  const [clock, setClock] = useState(Date.now());
  const [liveNow, setLiveNow] = useState(() => new Date());

  /* ---------------- modals ---------------- */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatPassphrase, setNewChatPassphrase] = useState('');
  const [isEphemeralChat, setIsEphemeralChat] = useState(false);

  // Instagram-style "New message" people picker (online mode)
  const [dmTo, setDmTo] = useState('');
  const [dmSearch, setDmSearch] = useState('');
  const [dmResults, setDmResults] = useState<Account[]>([]);
  const [dmSuggested, setDmSuggested] = useState<Account[]>([]);
  const [dmFollow, setDmFollow] = useState<Record<string, FollowState>>({});
  const [dmBusy, setDmBusy] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState(false);

  // Instagram group chat creation
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<Account[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupResults, setGroupResults] = useState<Account[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [targetChatId, setTargetChatId] = useState<string | null>(null);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTargetId, setUnlockTargetId] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);

  const chatLocked = !!activeChat && unlockedChatId !== activeChat.id;
  const lastMsgCountRef = useRef(0);

  /* ---------------- clock + visibility ---------------- */
  useEffect(() => {
    const t = setInterval(() => setLiveNow(new Date()), 1000);
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /* ---------------- incoming message alerts ---------------- */
  useEffect(() => {
    const lastCount = lastMsgCountRef.current;
    const newCount = messages.length;
    if (lastCount > 0 && newCount > lastCount) {
      const latest = messages[messages.length - 1];
      if (latest && latest.sender_id !== deviceId && latest.sender_id !== 'SYSTEM') {
        // Instagram: muted chats stay silent (sound + desktop notification)
        const muted = activeChat ? isChatMuted(activeChat.id) : false;
        if (!muted && localStorage.getItem('axon_sound_enabled') !== 'false') playPing();
        if (!muted && localStorage.getItem('axon_notifications_enabled') === 'true' && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('New message', {
              body: `${latest.text?.slice(0, 120) || 'Sent a file or voice note'}`,
              tag: 'axon-incoming',
            });
          } catch {
            /* notifications unavailable */
          }
        }
      }
    }
    lastMsgCountRef.current = newCount;
    setRefreshKey(k => k + 1);
  }, [messages, deviceId, activeChat]);

  /* ---------------- idle auto-lock ---------------- */
  useEffect(() => {
    const resetIdle = () => {
      if (isIdleLocked) return;
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => setIsIdleLocked(true), 120000);
    };
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [isIdleLocked]);

  /* ---------------- unlock gate ---------------- */
  useEffect(() => {
    if (activeChat && chatLocked) {
      setUnlockTargetId(activeChat.id);
      setUnlockPassword('');
      setUnlockError(false);
      setShowUnlockModal(true);
    } else {
      setShowUnlockModal(false);
    }
  }, [activeChat?.id, chatLocked]);

  useEffect(() => {
    if (lockoutUntil <= Date.now()) return;
    const t = setInterval(() => {
      setClock(Date.now());
      if (Date.now() >= lockoutUntil) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [lockoutUntil]);

  /* ---------------- modal handlers ---------------- */
  const openCreateModal = () => {
    setNewChatName('');
    setNewChatPassphrase(generateEasyPasscode());
    setIsEphemeralChat(false);
    setDmTo('');
    setDmSearch('');
    setDmResults([]);
    setDmSuggested([]);
    setDmFollow({});
    setDmError(null);
    setShowCreateModal(true);
    // Instagram behavior: suggest the people you follow first
    if (backendMode === 'online' && supabase && account) {
      fetchFollowing(supabase, account.username)
        .then(handles => fetchAccountsByUsernames(supabase, handles))
        .then(accs => {
          setDmSuggested(accs);
          const next: Record<string, FollowState> = {};
          accs.forEach(a => { next[a.username] = { following: true, requested: false, followsMe: false }; });
          setDmFollow(prev => ({ ...prev, ...next }));
        })
        .catch(() => setDmSuggested([]));
    }
  };

  // People search inside the New message picker (debounced)
  useEffect(() => {
    if (!showCreateModal || backendMode !== 'online' || !dmSearch.trim()) {
      setDmResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchAccounts(dmSearch)
        .then(res => {
          setDmResults(res);
          if (supabase && account) {
            Promise.all(res.map(async a => ({ u: a.username, s: await fetchFollowState(supabase, account.username, a.username) })))
              .then(pairs => setDmFollow(prev => {
                const next = { ...prev };
                pairs.forEach(p => { next[p.u] = p.s; });
                return next;
              }))
              .catch(() => undefined);
          }
        })
        .catch(() => setDmResults([]));
    }, 220);
    return () => clearTimeout(t);
  }, [dmSearch, showCreateModal, backendMode, searchAccounts, account]);

  const toggleDmFollow = async (acc: Account) => {
    if (!supabase || !account) return;
    const st = dmFollow[acc.username] || { following: false, requested: false, followsMe: false };
    if (st.following || st.requested) {
      await unfollowUser(supabase, account.username, acc.username);
      setDmFollow(prev => ({ ...prev, [acc.username]: { ...st, following: false, requested: false } }));
    } else {
      const status = await followUser(supabase, account.username, acc.username, acc.is_private === true);
      setDmFollow(prev => ({
        ...prev,
        [acc.username]: { ...st, following: status === 'active', requested: status === 'pending' },
      }));
    }
  };

  const handleDmStart = async (handle?: string) => {
    setDmError(null);
    setDmBusy(true);
    const res = await startDmWithUser(handle ?? dmTo);
    setDmBusy(false);
    if (res.ok && res.chat) {
      setShowCreateModal(false);
      setActiveChat(res.chat);
      setPane('chat');
      setMobileView('chat');
    } else {
      setDmError(res.error || 'Could not start the chat.');
    }
  };

  const dmPickerRow = (acc: Account) => {
    const st = dmFollow[acc.username];
    return (
      <div key={acc.id} className="flex items-center gap-2.5 px-1 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
        <Avatar seed={acc.username} name={`@${acc.username}`} size={40} gradient={acc.avatar_gradient || undefined} />
        <button type="button" onClick={() => { setDmTo(`@${acc.username}`); setDmError(null); }} className="flex-1 min-w-0 text-left">
          <div className="text-sm text-white font-semibold truncate">@{acc.username}</div>
          <div className="text-[10px] text-zinc-600 truncate">
            {acc.display_name?.trim() ? acc.display_name : (acc.bio?.trim() ? acc.bio : 'Follow them to chat')}
          </div>
        </button>
        {st?.following ? (
          <>
            <button
              type="button"
              onClick={() => toggleDmFollow(acc)}
              className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1.5 rounded-lg border border-white/10 text-zinc-300 hover:border-white/25 transition-colors"
              title="Tap to unfollow"
            >
              Following
            </button>
            <button
              type="button"
              onClick={() => { handleDmStart(`@${acc.username}`); }}
              className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/25 transition-colors"
              title={`Message @${acc.username}`}
            >
              Message
            </button>
          </>
        ) : st?.requested ? (
          <button
            type="button"
            onClick={() => toggleDmFollow(acc)}
            className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1.5 rounded-lg border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 transition-colors"
            title="Tap to cancel the request"
          >
            Requested
          </button>
        ) : (
          <button
            type="button"
            onClick={() => toggleDmFollow(acc)}
            className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/25 transition-colors"
            title={`Follow @${acc.username}`}
          >
            Follow
          </button>
        )}
      </div>
    );
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newChatPassphrase.trim().length < 4) return;
    const dup = chats.find(c => c.share_code === newChatPassphrase.trim().toUpperCase());
    if (dup) return;
    const success = await createChat(newChatName, newChatPassphrase, isEphemeralChat);
    if (success) setShowCreateModal(false);
  };

  /* ---------------- group creation (Instagram group DM) ---------------- */
  // FOLLOW GATE: only people you follow can be added
  const [groupEligible, setGroupEligible] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!showGroupModal || backendMode !== 'online' || !supabase || !account) {
      setGroupEligible(new Set());
      return;
    }
    fetchFollowing(supabase, account.username).then(list => setGroupEligible(new Set(list))).catch(() => setGroupEligible(new Set()));
  }, [showGroupModal, backendMode, account]);

  useEffect(() => {
    if (!showGroupModal || !groupSearch.trim()) { setGroupResults([]); return; }
    const t = setTimeout(() => {
      searchAccounts(groupSearch)
        .then(res => setGroupResults(res.filter(a =>
          !groupMembers.some(m => m.username === a.username) && groupEligible.has(a.username)
        )))
        .catch(() => setGroupResults([]));
    }, 220);
    return () => clearTimeout(t);
  }, [groupSearch, showGroupModal, groupMembers, searchAccounts, groupEligible]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGroupError(null);
    setGroupBusy(true);
    const res = await createGroupChat(groupName, groupMembers.map(m => m.username));
    setGroupBusy(false);
    if (res.ok) {
      setShowGroupModal(false);
      setGroupName('');
      setGroupMembers([]);
      setGroupSearch('');
    } else {
      setGroupError(res.error || 'Could not create the group.');
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    const success = await joinChat(joinCode.trim().toUpperCase());
    if (success) {
      setJoinCode('');
      setShowJoinModal(false);
      setJoinError(false);
    } else {
      setJoinError(true);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = targetChatId || activeChat?.id;
    if (id && renameInput.trim()) {
      await renameChat(id, renameInput.trim());
      setShowRenameModal(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetChatId || !passwordInput.trim()) return;
    const dup = chats.find(c => c.id !== targetChatId && c.share_code === passwordInput.trim().toUpperCase());
    if (dup) return;
    await changeChatPassword(targetChatId, passwordInput.trim().toUpperCase());
    setShowPasswordModal(false);
  };

  const handlePasswordKeyDown = () => {
    const now = Date.now();
    if (lastKeyTimeRef.current > 0) setKeystrokeTimings(prev => [...prev, now - lastKeyTimeRef.current]);
    lastKeyTimeRef.current = now;
  };

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Keystroke dynamics (decoy diversion on high deviation)
    const avgKeystroke = keystrokeTimings.length > 0
      ? keystrokeTimings.reduce((a, b) => a + b, 0) / keystrokeTimings.length
      : 0;
    const baseline = Number(localStorage.getItem('axon_keystroke_baseline'));
    if (!baseline && avgKeystroke > 0) {
      localStorage.setItem('axon_keystroke_baseline', avgKeystroke.toString());
    } else if (baseline > 0 && avgKeystroke > 0) {
      const diff = Math.abs(avgKeystroke - baseline) / baseline;
      if (diff > 0.4) {
        setIsDecoyMode(true);
        setShowUnlockModal(false);
        setKeystrokeTimings([]);
        return;
      }
    }
    setKeystrokeTimings([]);

    if (unlockPassword.trim() === decoyPassphrase) {
      setIsDecoyMode(true);
      setShowUnlockModal(false);
      return;
    }
    if (lockoutUntil > Date.now()) return;

    if (unlockTargetId && unlockChat(unlockTargetId, unlockPassword.trim())) {
      setShowUnlockModal(false);
      setFailedAttempts(0);
    } else {
      const fails = failedAttempts + 1;
      setFailedAttempts(fails);
      setUnlockError(true);
      if (fails >= 5) {
        setLockoutUntil(Date.now() + 30000);
        setFailedAttempts(0);
        setUnlockError(false);
      }
    }
  };

  /* ---------------- full-screen security states ---------------- */
  if (panicMode) {
    return (
      <div className="h-app w-full bg-white text-black flex flex-col items-center justify-center font-sans">
        <h1 className="text-4xl font-bold mb-2">404 Not Found</h1>
        <p className="text-gray-600">The requested URL was not found on this server.</p>
        <button className="mt-8 text-sm text-blue-600 underline" onClick={() => setPanicMode(false)}>Return Home</button>
      </div>
    );
  }

  if (isDecoyMode) {
    return (
      <div className="flex flex-col h-app w-full bg-white text-black font-sans p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full">
          <div className="flex justify-between items-center mb-6 border-b pb-4">
            <h1 className="text-3xl font-bold">Biology 101 Notes</h1>
            <button onClick={() => setIsDecoyMode(false)} className="text-gray-400 hover:text-black transition-colors">Exit</button>
          </div>
          <div className="space-y-4 text-gray-800">
            <h2 className="text-xl font-semibold">1. Mitosis Overview</h2>
            <p>Mitosis is a part of the cell cycle in which replicated chromosomes are separated into two new nuclei.</p>
            <p>Cell division gives rise to genetically identical cells in which the total number of chromosomes is maintained.</p>
            <h2 className="text-xl font-semibold mt-6">2. Phases of Mitosis</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Prophase:</strong> Chromatin condenses into chromosomes.</li>
              <li><strong>Metaphase:</strong> Chromosomes align at the metaphase plate.</li>
              <li><strong>Anaphase:</strong> Sister chromatids separate to opposite poles.</li>
              <li><strong>Telophase:</strong> Nuclear envelope reforms.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (isIdleLocked) {
    return (
      <div className="h-app w-full premium-bg text-[#a3a3a3] flex flex-col items-center justify-center font-mono relative overflow-hidden">
        <div className="absolute inset-0 grid-overlay" />
        <div className="absolute inset-0 vignette" />
        <div className="absolute inset-0 bg-black/50 z-10" />
        <div className="z-20 flex flex-col items-center">
          <Lock className="w-16 h-16 text-cyan-500 mb-6" />
          <h1 className="text-2xl font-bold tracking-widest text-cyan-400 mb-4 uppercase">Screen locked</h1>
          <p className="text-zinc-500 text-sm mb-8 text-center max-w-md">You've been away for a while. Your chats are safe — tap below to come back.</p>
          <button
            onClick={() => setIsIdleLocked(false)}
            className="px-8 py-3 bg-cyan-400/10 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black transition-all uppercase tracking-widest font-bold"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- desktop right pane content ---------------- */
  const routeUsername = decodeURIComponent(
    (location.pathname.replace(/^\/profile\//, '') || '').replace(/\/(followers|following)$/, '')
  );
  const handleExploreMessage = async (username: string) => {
    const res = await startDmWithUser(`@${username.replace(/^@/, '')}`);
    if (res.ok && res.chat) {
      setActiveChat(res.chat);
      go('/direct');
    }
    return res;
  };
  const rightPane = (() => {
    if (pane === 'profile') {
      return (
        <ProfilePanel
          onBack={() => go('/direct')}
          onOpenSettings={() => go('/settings')}
          onTriggerPanic={() => setPanicMode(true)}
          refreshKey={refreshKey}
        />
      );
    }
    if (pane === 'settings') {
      return (
        <Suspense fallback={<Loading />}>
          <SettingsPanel onBack={() => go('/profile')} />
        </Suspense>
      );
    }
    if (pane === 'explore') {
      return <ExplorePanel onBack={() => go('/direct')} onOpenProfile={u => openProfileAt(u)} onMessage={handleExploreMessage} />;
    }
    if (pane === 'notifications') {
      return (
        <NotificationsPanel
          onBack={() => go('/direct')}
          onOpenProfile={u => openProfileAt(u)}
          onOpenMessages={() => go('/direct')}
          onAllRead={() => setUnreadNotifs(0)}
        />
      );
    }
    if (pane === 'user') {
      const uname = routeUsername.trim().toLowerCase();
      if (!uname) return <NotFoundPane onHome={() => go('/direct')} />;
      return (
        <UserProfilePage
          key={uname}
          username={uname}
          isMe={uname === (account?.username || '')}
          onBack={() => go('/direct')}
          onOpenSettings={() => go('/settings')}
          onMessage={handleExploreMessage}
        />
      );
    }
    if (pane === 'reset') {
      return <ResetPasswordPanel onBack={() => go('/direct')} />;
    }
    if (pane === 'admin') {
      return <AdminPanel onBack={() => go('/direct')} />;
    }
    if (pane === 'notfound') {
      return <NotFoundPane onHome={() => go('/direct')} />;
    }
    if (activeChat) {
      return (
        <ConversationPanel
          key={activeChat.id}
          chat={activeChat}
          onBack={() => { setMobileView('inbox'); go('/direct'); }}
          onRequestRename={(id) => {
            const c = chats.find(x => x.id === id);
            if (c) { setTargetChatId(id); setRenameInput(c.name); setShowRenameModal(true); }
          }}
          onRequestKeyRotation={(id) => { setTargetChatId(id); setPasswordInput(''); setShowPasswordModal(true); }}
          onTriggerPanic={() => setPanicMode(true)}
          onOpenProfile={u => openProfileAt(u)}
          privacyLocked={!!activeChat && isPrivacyLocked(activeChat.id)}
          chatLockEnabled={chatLockOn}
          chatProtected={!!activeChat && protectedIds.has(activeChat.id)}
          onPrivacyUnlocked={() => { bumpMessagesReload(); bumpLock(); }}
          onProtectedChanged={() => { resyncChatLock(); bumpMessagesReload(); }}
        />
      );
    }
    return <EmptyChatState onNewMessage={openCreateModal} onNewGroup={() => setShowGroupModal(true)} onJoin={() => setShowJoinModal(true)} />;
  })();

  const mobileFull = mobileView !== 'inbox' && (mobileView !== 'chat' || !!activeChat);

  // Chat rows / status bar show the other person's handle on DM channels
  const displayChatName = (chat: Chat) =>
    account ? dmDisplayName(chat.name, account.username) : chat.name;

  return (
    <div className={`h-app w-full premium-bg text-[#d6d8de] font-mono overflow-hidden relative scanlines ${stealthActive ? 'blur-xl' : ''}`}>
      {/* ambient background */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grid-overlay" />
        <div className="absolute inset-0 vignette" />
      </div>

      {stealthActive && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-4 py-1.5 rounded-full border border-blue-500/40 bg-[#0a1030] text-[10px] font-bold tracking-[0.25em] uppercase text-blue-400 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Stealth mode
        </div>
      )}

      {/* ── MAC WINDOW (restored chrome) ── */}
      <div className="relative z-10 flex flex-col h-full min-h-0 p-1.5 sm:p-3 lg:p-4 xl:p-5">
        <div className="term-window flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="term-inner-glow" aria-hidden />

          {/* TITLE BAR (traffic lights + session + live clock) */}
          <div className="term-titlebar h-9 shrink-0 flex items-center gap-3 px-3 sm:px-4 lg:px-7 border-b border-white/[0.07] select-none">
            <div className="flex items-center gap-2 shrink-0" aria-hidden>
              <span className="tl tl-red" />
              <span className="tl tl-amber" />
              <span className="tl tl-green" />
            </div>
            <div className="flex-1 min-w-0 text-center">
              <span className="font-display text-[10px] font-bold tracking-[0.3em] uppercase truncate block">
                <span className="text-gradient phosphor-text">Axon Logs</span>
                <span className="text-zinc-600 hidden sm:inline"> — secure messenger</span>
                <span className="text-emerald-500/70 hidden lg:inline"> // axon@axonlogs:~/direct</span>
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-[9px] md:text-[10px] font-bold tracking-widest uppercase text-zinc-500 tabular-nums">
              <span className="hidden sm:inline text-cyan-500/90">{account ? `@${account.username}` : `NODE: ${deviceId.substring(0, 8)}`}</span>
              <span className="text-emerald-500/90">{liveNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
            </div>
          </div>

          {/* ── CONTENT ROW (rail + inbox + right pane) ── */}
          <div className="flex flex-1 min-h-0 min-w-0">
            {/* DESKTOP LEFT RAIL (Instagram-web style) */}
            <nav className="hidden md:flex flex-col items-center gap-1 w-[68px] shrink-0 border-r border-white/[0.05] bg-[#07070d]/60 py-4 z-20">
              <div className="mb-4">
                <button
                  type="button"
                  aria-label="Axon Logs home"
                  onClick={() => go('/direct')}
                  className="w-10 h-10 rounded-xl ring-gradient flex items-center justify-center hover:brightness-125 transition-all"
                >
                  <Compass className="w-5 h-5 text-cyan-300" />
                </button>
              </div>
              <RailButton
                icon={<MessageCircle className="w-[22px] h-[22px]" />}
                label="Chats"
                active={pane === 'chat'}
                onClick={() => go('/direct')}
              />
              <RailButton
                icon={<Search className="w-[22px] h-[22px]" />}
                label="Search"
                active={pane === 'explore'}
                onClick={() => go('/explore')}
              />
              <div className="relative">
                <RailButton
                  icon={<Heart className="w-[22px] h-[22px]" />}
                  label="Notifications"
                  active={pane === 'notifications'}
                  onClick={() => go('/notifications')}
                />
                {unreadNotifs > 0 && pane !== 'notifications' && (
                  <span className="absolute top-0.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center pointer-events-none">
                    {unreadNotifs > 9 ? '9+' : unreadNotifs}
                  </span>
                )}
              </div>
              <RailButton
                icon={<MessageCircle className="w-[22px] h-[22px]" />}
                label="New message"
                onClick={openCreateModal}
              />
              <RailButton
                icon={<KeyRound className="w-[22px] h-[22px]" />}
                label="Use invite code"
                onClick={() => setShowJoinModal(true)}
              />
              <div className="flex-1" />
              <RailButton
                icon={<Avatar seed={deviceId} name={alias || '?'} size={26} gradient={myGradient} src={(account as any)?.avatar_url || undefined} />}
                label="Profile"
                active={pane === 'profile' || pane === 'user'}
                onClick={() => openProfileAt()}
              />
              <RailButton
                icon={<SettingsIcon className="w-[22px] h-[22px]" />}
                label="Settings"
                active={pane === 'settings'}
                onClick={() => go('/settings')}
              />
            </nav>

            {/* INBOX (middle column on desktop, full screen on mobile) */}
            <div className={`w-full md:w-[340px] lg:w-[380px] shrink-0 min-h-0 flex flex-col ${mobileFull ? 'hidden md:flex' : 'flex'}`}>
              <div className="flex-1 min-h-0">
                <InboxPanel
                  onOpenChat={(chat: Chat) => { setActiveChat(chat); setMobileView('chat'); go(`/direct/t/${chat.id}`); }}
                  onOpenProfile={() => openProfileAt()}
                  onNewMessage={openCreateModal}
                  onNewGroup={() => setShowGroupModal(true)}
                  onJoinCode={() => setShowJoinModal(true)}
                  refreshKey={refreshKey}
                  lockTick={lockTick}
                />
              </div>
            </div>

            {/* RIGHT PANE (conversation / profile / settings / explore ...) */}
            <main className={`flex-1 min-w-0 min-h-0 hidden md:block`}>
              {rightPane}
            </main>
            <div className={`flex-1 min-w-0 min-h-0 md:hidden ${mobileFull ? 'block' : 'hidden'}`}>
              {rightPane}
            </div>
          </div>

          {/* ── MOBILE BOTTOM NAV (Instagram-style) ── */}
          <nav className="md:hidden shrink-0 border-t border-white/[0.07] bg-[#07070d]/90 flex items-center justify-around px-2 py-2 z-30">
            <NavBtn
              icon={<MessageCircle className="w-[22px] h-[22px]" />}
              label="Chats"
              active={pane === 'chat'}
              onClick={() => go('/direct')}
            />
            <NavBtn
              icon={<Search className="w-[22px] h-[22px]" />}
              label="Search"
              active={pane === 'explore'}
              onClick={() => go('/explore')}
            />
            <div className="relative">
              <NavBtn
                icon={<Heart className="w-[22px] h-[22px]" />}
                label="Activity"
                active={pane === 'notifications'}
                onClick={() => go('/notifications')}
              />
              {unreadNotifs > 0 && pane !== 'notifications' && (
                <span className="absolute -top-1 right-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center pointer-events-none">
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              )}
            </div>
            <NavBtn
              icon={<Avatar seed={deviceId} name={alias || '?'} size={22} gradient={myGradient} src={(account as any)?.avatar_url || undefined} />}
              label="Profile"
              active={pane === 'profile' || pane === 'user'}
              onClick={() => openProfileAt()}
            />
          </nav>

          {/* ── STATUS BAR (tmux-style, restored) ── */}
          <div className="term-statusbar shrink-0 border-t border-white/[0.07] flex items-center gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 md:px-6 lg:px-7 text-[8px] sm:text-[9px] md:text-[10px] font-bold tracking-widest uppercase select-none min-h-[28px] md:min-h-[32px]">
            <span className={`flex items-center gap-1.5 shrink-0 ${backendMode === 'online' ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className="w-1.5 h-1.5 rounded-full dot-live" />
              <span className="hidden sm:inline">ONLINE · SYNCED</span>
              <span className="sm:hidden">{backendMode === 'online' ? 'ONLINE' : 'OFFLINE'}</span>
            </span>
            {activeChat && (
              <span className="text-zinc-400 truncate min-w-0 hidden md:inline">CHAT: {displayChatName(activeChat)}</span>
            )}
            {Object.keys(typingUsers).length > 0 && (
              <span className="text-amber-400 truncate hidden sm:inline flex items-center gap-1">
                <span className="flex gap-[3px]">
                  <span className="typing-dot w-1 h-1 rounded-full bg-amber-400" />
                  <span className="typing-dot w-1 h-1 rounded-full bg-amber-400" />
                  <span className="typing-dot w-1 h-1 rounded-full bg-amber-400" />
                </span>
                {Object.values(typingUsers).join(', ')}
              </span>
            )}
            <div className="flex-1" />
            {Object.keys(onlineUsers).length > 0 && (
              <span className="text-cyan-400/70 hidden md:inline">ONLINE: {Object.keys(onlineUsers).length}</span>
            )}
            {latency > 0 && <span className="text-emerald-500/80 hidden sm:inline">SPEED: {latency}ms</span>}
            <span className="text-zinc-500 hidden sm:inline">CHATS: {chats.length}</span>
            <span className="text-cyan-500/90 hidden lg:inline">ID: {deviceId.substring(0, 8)}</span>
            <span className="text-emerald-500/90 tabular-nums shrink-0">{liveNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
          </div>
        </div>
      </div>

      {/* ══════════════ MODALS ══════════════ */}

      {showCreateModal && (
        <ModalShell onClose={() => setShowCreateModal(false)} accent="emerald">
          {backendMode === 'online' ? (
            <>
              <h3 className="text-white font-bold text-lg mb-1">New message</h3>
              <p className="text-zinc-500 text-xs mb-5">Pick someone you follow — chats are only for people you follow.</p>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-zinc-400 shrink-0">To:</span>
                <input
                  type="text"
                  value={dmTo || dmSearch}
                  onChange={e => {
                    const v = e.target.value;
                    setDmTo('');
                    setDmSearch(v);
                    setDmError(null);
                  }}
                  placeholder="Search @username…"
                  className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500/60 transition-colors"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleDmStart()}
                  disabled={dmBusy || !dmTo.trim()}
                  className="btn-premium shrink-0 px-5 py-2 rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {dmBusy ? '…' : 'Chat'}
                </button>
              </div>
              {dmError && (
                <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">{dmError}</div>
              )}
              <div className="max-h-72 overflow-y-auto feed-scroll -mx-1 px-1">
                {(dmSearch.trim() ? dmResults : dmSuggested).length > 0 && (
                  <div className="text-[9px] font-bold tracking-[0.25em] text-zinc-600 uppercase px-1 pb-1">
                    {dmSearch.trim() ? 'Results' : 'You follow'}
                  </div>
                )}
                {(dmSearch.trim() ? dmResults : dmSuggested).map(dmPickerRow)}
                {dmSearch.trim() && dmResults.length === 0 && (
                  <div className="text-center text-zinc-600 text-xs py-6">No people found for “{dmSearch.trim()}”.</div>
                )}
                {!dmSearch.trim() && dmSuggested.length === 0 && (
                  <div className="text-center text-zinc-600 text-xs py-6 leading-relaxed">
                    You're not following anyone yet.<br />Search a @username above and follow them first.
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <h3 className="text-white font-bold text-lg mb-1">New local chat</h3>
              <p className="text-zinc-500 text-xs mb-5">You're offline — this creates a practice chat on this device only. Online chats are Instagram-style: follow people, then message them.</p>
              <form onSubmit={handleCreateChat} className="space-y-4">
                <Field label="NAME">
                  <input
                    type="text"
                    value={newChatName}
                    onChange={e => setNewChatName(e.target.value)}
                    placeholder="e.g. nova"
                    className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500/60 transition-colors"
                    autoFocus
                  />
                </Field>
                <Field label="CHAT KEY">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newChatPassphrase}
                      onChange={e => setNewChatPassphrase(e.target.value.toUpperCase())}
                      className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500/60 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setNewChatPassphrase(generateEasyPasscode())}
                      className="shrink-0 text-[10px] font-bold tracking-widest uppercase text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg px-3 transition-colors"
                    >
                      New
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1.5">This key locks your messages. It stays on this device — keep it safe.</p>
                </Field>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={isEphemeralChat} onChange={e => setIsEphemeralChat(e.target.checked)} className="hidden" />
                  {isEphemeralChat ? <ToggleRight className="text-red-500 w-6 h-6" /> : <ToggleLeft className="text-zinc-600 w-6 h-6" />}
                  <span className="text-xs text-zinc-400">Vanishing chat <span className="text-zinc-600">(messages disappear when everyone leaves)</span></span>
                </label>
                <button type="submit" className="btn-premium w-full py-2.5 rounded-lg mt-2">
                  Create chat
                </button>
              </form>
            </>
          )}
        </ModalShell>
      )}

      {showGroupModal && (
        <ModalShell onClose={() => setShowGroupModal(false)} accent="cyan">
          <h3 className="text-white font-bold text-lg mb-1">New group</h3>
          <p className="text-zinc-500 text-xs mb-5">Name the group and add people you follow — they're invited automatically.</p>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <Field label="GROUP NAME">
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="e.g. the squad"
                maxLength={40}
                className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-cyan-500/60 transition-colors"
                autoFocus
              />
            </Field>
            <Field label="MEMBERS">
              {groupMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {groupMembers.map(m => (
                    <span key={m.username} className="flex items-center gap-1 text-[10px] font-bold text-cyan-200 border border-cyan-400/40 bg-cyan-400/10 rounded-full pl-2 pr-1 py-0.5">
                      @{m.username}
                      <button type="button" onClick={() => setGroupMembers(prev => prev.filter(x => x.username !== m.username))} className="hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={groupSearch}
                onChange={e => setGroupSearch(e.target.value)}
                placeholder="Search people you follow…"
                className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-cyan-500/60 transition-colors"
              />
              {groupSearch.trim() && groupResults.length === 0 && (
                <p className="text-[10px] text-zinc-600 mt-1.5">No one you follow matches “{groupSearch.trim()}”. Follow them first, then add them.</p>
              )}
              {groupSearch.trim() && groupResults.length > 0 && (
                <div className="mt-1.5 border border-white/[0.07] rounded-lg overflow-hidden max-h-40 overflow-y-auto feed-scroll">
                  {groupResults.map(acc => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setGroupMembers(prev => [...prev, acc]);
                        setGroupSearch('');
                        setGroupResults([]);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.05] text-left transition-colors"
                    >
                      <Avatar seed={acc.username} name={`@${acc.username}`} size={28} gradient={acc.avatar_gradient || undefined} />
                      <span className="text-xs text-zinc-200 flex-1 truncate">@{acc.username}</span>
                      <Users className="w-3.5 h-3.5 text-cyan-400" />
                    </button>
                  ))}
                </div>
              )}
            </Field>
            {groupError && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">{groupError}</div>
            )}
            <button
              type="submit"
              disabled={groupBusy || !groupName.trim() || groupMembers.length === 0}
              className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Users className="w-4 h-4" />
              {groupBusy ? 'Creating…' : 'Create group'}
            </button>
          </form>
        </ModalShell>
      )}

      {showJoinModal && (
        <ModalShell onClose={() => { setShowJoinModal(false); setJoinError(false); }} accent="cyan">
          <h3 className="text-white font-bold text-lg mb-1">Join a chat</h3>
          <p className="text-zinc-500 text-xs mb-5">Paste the invite code a friend shared with you.</p>
          <form onSubmit={handleJoinSubmit} className="space-y-4">
            {joinError && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
                That code didn't match any chat — check it and try again.
              </div>
            )}
            <Field label="INVITE CODE">
              <input
                type="text"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(false); }}
                placeholder="AXON-0000"
                className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-cyan-500/60 transition-colors tracking-widest"
                autoFocus
              />
            </Field>
            <button type="submit" className="btn-premium w-full py-2.5 rounded-lg">Join chat</button>
          </form>
        </ModalShell>
      )}

      {showRenameModal && (
        <ModalShell onClose={() => setShowRenameModal(false)} accent="cyan">
          <h3 className="text-white font-bold text-lg mb-5">Rename chat</h3>
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <Field label="NEW NAME">
              <input
                type="text"
                value={renameInput}
                onChange={e => setRenameInput(e.target.value)}
                className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-cyan-500/60 transition-colors"
                autoFocus
              />
            </Field>
            <button type="submit" className="btn-premium w-full py-2.5 rounded-lg">Save name</button>
          </form>
        </ModalShell>
      )}

      {showPasswordModal && (
        <ModalShell onClose={() => setShowPasswordModal(false)} accent="red">
          <h3 className="text-white font-bold text-lg mb-1">Change chat key</h3>
          <p className="text-red-400 text-xs mb-5 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
            Changing the key hides the old messages. Share the new key so everyone can rejoin.
          </p>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <Field label="NEW CHAT KEY">
              <input
                type="text"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value.toUpperCase())}
                className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-red-500/60 transition-colors tracking-widest"
                autoFocus
              />
            </Field>
            <button type="submit" className="w-full bg-red-500 hover:bg-red-400 text-black py-2.5 rounded-lg text-xs font-bold tracking-widest uppercase transition-colors">
              Change key
            </button>
          </form>
        </ModalShell>
      )}

      {showUnlockModal && (
        <ModalShell
          onClose={() => { setShowUnlockModal(false); if (chatLocked) setMobileView('inbox'); }}
          accent="emerald"
        >
          <div className="flex flex-col items-center mb-5">
            <div className="w-14 h-14 rounded-full border border-emerald-500/40 bg-emerald-500/[0.07] flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-white font-bold text-lg">Enter the chat key</h3>
            <p className="text-zinc-500 text-xs mt-1 text-center">
              Only people with the key can read {activeChat ? displayChatName(activeChat) : 'this chat'}
            </p>
          </div>
          <form onSubmit={handleUnlockSubmit} className="space-y-4">
            {lockoutUntil > clock && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
                Too many tries — wait {Math.ceil((lockoutUntil - clock) / 1000)}s and try again.
              </div>
            )}
            {unlockError && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
                That's not the right key. {5 - failedAttempts} tries left.
              </div>
            )}
            <input
              type="password"
              value={unlockPassword}
              onChange={e => setUnlockPassword(e.target.value.toUpperCase())}
              onKeyDown={handlePasswordKeyDown}
              disabled={lockoutUntil > clock}
              className="w-full term-input rounded-lg p-3 text-white text-sm outline-none focus:border-emerald-500/60 transition-colors tracking-widest text-center disabled:opacity-50"
              autoFocus
            />
            <button
              type="submit"
              disabled={lockoutUntil > clock}
              className="btn-premium w-full py-2.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Unlock
            </button>
            <p className="text-[10px] text-zinc-600 text-center">
              Keys stay on this device — they're never uploaded anywhere.
            </p>
          </form>
        </ModalShell>
      )}

      {/* call overlays */}
      <CallOverlay />
      <IncomingCallScreen />
      {/* Phase 5 / S3: one-time keyring unlock on new devices */}
      <KeyringGate />
    </div>
  );
};

/* ------------------------- small building blocks ------------------------- */

const Loading = () => (
  <div className="h-full flex items-center justify-center text-[10px] tracking-widest uppercase text-zinc-600">
    Loading…
  </div>
);

const EmptyChatState: React.FC<{ onNewMessage: () => void; onNewGroup: () => void; onJoin: () => void }> = ({ onNewMessage, onNewGroup, onJoin }) => (
  <div className="h-full flex flex-col items-center justify-center gap-5 text-center px-8">
    <div className="w-24 h-24 rounded-full border-2 border-cyan-400/25 bg-cyan-400/[0.05] flex items-center justify-center glow-cyan">
      <MessageCircle className="w-10 h-10 text-cyan-300" />
    </div>
    <div>
      <div className="text-white font-bold text-xl tracking-wide mb-2">Your messages</div>
      <div className="text-zinc-500 text-sm max-w-xs leading-relaxed">
        Follow people, then message them privately.<br />Only you two can read your chats. No feeds. No noise.
      </div>
    </div>
    <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
      <button onClick={onNewMessage} className="btn-premium px-6 py-2.5 rounded-lg text-xs">Message</button>
      <button
        onClick={onNewGroup}
        className="term-panel term-interactive px-6 py-2.5 rounded-lg text-xs text-zinc-300 hover:text-cyan-300 border border-white/[0.07] transition-colors flex items-center gap-1.5"
      >
        <Users className="w-3.5 h-3.5" /> New group
      </button>
      <button
        onClick={onJoin}
        className="term-panel term-interactive px-6 py-2.5 rounded-lg text-xs text-zinc-300 hover:text-cyan-300 border border-white/[0.07] transition-colors"
      >
        Use invite code
      </button>
    </div>
    <SecurityNote compact className="w-full max-w-xs mt-1" />
  </div>
);

const RailButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all group ${
      active ? 'bg-cyan-400/10 text-cyan-300 term-glow-cyan' : 'text-zinc-400 hover:text-white hover:bg-white/5'
    }`}
  >
    {icon}
    <span className="pointer-events-none absolute left-[64px] opacity-0 group-hover:opacity-100 transition-opacity bg-[#0b0d15] border border-white/10 text-[10px] text-zinc-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap z-50">
      {label}
    </span>
  </button>
);

const ModalShell: React.FC<{
  children: React.ReactNode;
  onClose: () => void;
  accent: 'cyan' | 'emerald' | 'red';
}> = ({ children, onClose, accent }) => {
  const accentBorder = accent === 'cyan' ? 'border-cyan-500/40' : accent === 'emerald' ? 'border-emerald-500/40' : 'border-red-500/40';
  const accentBar = accent === 'cyan' ? 'bg-cyan-500' : accent === 'emerald' ? 'bg-emerald-500' : 'bg-red-500';
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`term-panel ${accentBorder} w-full max-w-md rounded-2xl p-6 relative overflow-hidden shadow-2xl`}>
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentBar}`} />
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-1.5">{label}</label>
    {children}
  </div>
);

/** Mobile bottom-nav button (Instagram-style, icon + tiny label). */
const NavBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`w-12 h-11 rounded-xl flex items-center justify-center transition-all ${
      active ? 'text-cyan-300 bg-cyan-400/10' : 'text-zinc-400 active:scale-95'
    }`}
  >
    {icon}
  </button>
);

/** In-app 404 — real route, reachable from bad deep links. */
const NotFoundPane: React.FC<{ onHome: () => void }> = ({ onHome }) => (
  <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
    <div className="font-display text-6xl font-bold text-gradient">404</div>
    <div className="text-white font-bold tracking-wide">This page isn't here</div>
    <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">
      The link may be broken, or the page may have been removed.
    </p>
    <button onClick={onHome} className="btn-premium px-6 py-2.5 rounded-lg text-xs mt-2">
      Back to your messages
    </button>
  </div>
);

export default ChatApp;

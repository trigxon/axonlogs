import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  MessageCircle, PlusSquare, Settings as SettingsIcon, X, KeyRound,
  ToggleRight, ToggleLeft, Lock,
} from 'lucide-react';
import { useCrypto, type Chat } from '../../contexts/CryptoContext';
import { dmDisplayName } from '../../utils/auth';
import InboxPanel from '../chat/InboxPanel';
import ConversationPanel from '../chat/ConversationPanel';
import ProfilePanel from '../profile/ProfilePanel';
import Avatar from '../profile/Avatar';
import CallOverlay, { IncomingCallScreen } from '../calling/CallOverlay';
import SecurityNote from '../ui/SecurityNote';

const SettingsPanel = lazy(() => import('../settings/SettingsPanel'));

type Pane = 'chat' | 'profile' | 'settings';

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
    createChat, joinChat, renameChat, changeChatPassword,
    unlockedChatId, unlockChat, settings, backendMode, myGradient,
    latency, typingUsers, onlineUsers, account,
  } = useCrypto();

  /* ---------------- navigation state ---------------- */
  const [mobileView, setMobileView] = useState<'inbox' | 'chat' | 'profile' | 'settings'>('inbox');
  const [pane, setPane] = useState<Pane>('chat');
  const [refreshKey, setRefreshKey] = useState(0);

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

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState(false);

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
        if (localStorage.getItem('axon_sound_enabled') !== 'false') playPing();
        if (localStorage.getItem('axon_notifications_enabled') === 'true' && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('[AXON LOGS] NEW MESSAGE', {
              body: `${latest.text?.slice(0, 120) || '[ATTACHMENT / VOICE MEMO]'}`,
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
  }, [messages, deviceId]);

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
    setShowCreateModal(true);
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newChatPassphrase.trim().length < 4) return;
    const dup = chats.find(c => c.share_code === newChatPassphrase.trim().toUpperCase());
    if (dup) return;
    const success = await createChat(newChatName, newChatPassphrase, isEphemeralChat);
    if (success) setShowCreateModal(false);
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
          <p className="text-zinc-500 text-sm mb-8 text-center max-w-md">Idle limit exceeded. Your chats stay encrypted until you return.</p>
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
  const rightPane = (() => {
    if (pane === 'profile') {
      return (
        <ProfilePanel
          onBack={() => setPane('chat')}
          onOpenSettings={() => setPane('settings')}
          onTriggerPanic={() => setPanicMode(true)}
        />
      );
    }
    if (pane === 'settings') {
      return (
        <Suspense fallback={<Loading />}>
          <SettingsPanel onBack={() => setPane('profile')} />
        </Suspense>
      );
    }
    if (activeChat) {
      return (
        <ConversationPanel
          key={activeChat.id}
          chat={activeChat}
          onBack={() => { setMobileView('inbox'); setPane('chat'); }}
          onRequestRename={(id) => {
            const c = chats.find(x => x.id === id);
            if (c) { setTargetChatId(id); setRenameInput(c.name); setShowRenameModal(true); }
          }}
          onRequestKeyRotation={(id) => { setTargetChatId(id); setPasswordInput(''); setShowPasswordModal(true); }}
          onTriggerPanic={() => setPanicMode(true)}
        />
      );
    }
    return <EmptyChatState onNewMessage={openCreateModal} onJoin={() => setShowJoinModal(true)} />;
  })();

  const showChatOnMobile = mobileView === 'chat' && activeChat;

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
                <div className="w-10 h-10 rounded-xl ring-gradient flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-cyan-300" />
                </div>
              </div>
              <RailButton
                icon={<MessageCircle className="w-[22px] h-[22px]" />}
                label="Chats"
                active={pane === 'chat'}
                onClick={() => { setPane('chat'); setMobileView('inbox'); }}
              />
              <RailButton
                icon={<PlusSquare className="w-[22px] h-[22px]" />}
                label="New message"
                onClick={openCreateModal}
              />
              <RailButton
                icon={<KeyRound className="w-[22px] h-[22px]" />}
                label="Join code"
                onClick={() => setShowJoinModal(true)}
              />
              <div className="flex-1" />
              <RailButton
                icon={<Avatar seed={deviceId} name={alias || '?'} size={26} gradient={myGradient} />}
                label="Profile"
                active={pane === 'profile'}
                onClick={() => setPane('profile')}
              />
              <RailButton
                icon={<SettingsIcon className="w-[22px] h-[22px]" />}
                label="Settings"
                active={pane === 'settings'}
                onClick={() => setPane('settings')}
              />
            </nav>

            {/* INBOX (middle column on desktop, full screen on mobile) */}
            <div className={`w-full md:w-[340px] lg:w-[380px] shrink-0 min-h-0 ${showChatOnMobile || mobileView === 'profile' || mobileView === 'settings' ? 'hidden md:block' : 'block'}`}>
              <InboxPanel
                onOpenChat={(chat: Chat) => { setActiveChat(chat); setPane('chat'); setMobileView('chat'); }}
                onOpenProfile={() => { setPane('profile'); setMobileView('profile'); }}
                onNewMessage={openCreateModal}
                onJoinCode={() => setShowJoinModal(true)}
                refreshKey={refreshKey}
              />
            </div>

            {/* RIGHT PANE (conversation / profile / settings) */}
            <main className={`flex-1 min-w-0 min-h-0 hidden md:block`}>
              {rightPane}
            </main>
            <div className={`flex-1 min-w-0 min-h-0 md:hidden ${showChatOnMobile || mobileView === 'profile' || mobileView === 'settings' ? 'block' : 'hidden'}`}>
              {rightPane}
            </div>
          </div>

          {/* ── STATUS BAR (tmux-style, restored) ── */}
          <div className="term-statusbar shrink-0 border-t border-white/[0.07] flex items-center gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 md:px-6 lg:px-7 text-[8px] sm:text-[9px] md:text-[10px] font-bold tracking-widest uppercase select-none min-h-[28px] md:min-h-[32px]">
            <span className={`flex items-center gap-1.5 shrink-0 ${backendMode === 'online' ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className="w-1.5 h-1.5 rounded-full dot-live" />
              <span className="hidden sm:inline">{backendMode === 'online' ? 'GLOBAL SYNC' : 'DEVICE-ONLY'}</span>
              <span className="sm:hidden">{backendMode === 'online' ? 'ONLINE' : 'LOCAL'}</span>
            </span>
            {activeChat && (
              <span className="text-zinc-400 truncate min-w-0 hidden md:inline">TERM: {displayChatName(activeChat)}</span>
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
              <span className="text-cyan-400/70 hidden md:inline">USR: {Object.keys(onlineUsers).length}</span>
            )}
            {latency > 0 && <span className="text-emerald-500/80 hidden sm:inline">LAT: {latency}MS</span>}
            <span className="text-zinc-500 hidden sm:inline">TERMS: {chats.length}</span>
            <span className="text-cyan-500/90 hidden lg:inline">NODE: {deviceId.substring(0, 8)}</span>
            <span className="text-emerald-500/90 tabular-nums shrink-0">{liveNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
          </div>
        </div>
      </div>

      {/* ══════════════ MODALS ══════════════ */}

      {showCreateModal && (
        <ModalShell onClose={() => setShowCreateModal(false)} accent="emerald">
          <h3 className="text-white font-bold text-lg mb-1">New message</h3>
          <p className="text-zinc-500 text-xs mb-5">Create an encrypted chat. Share the code with who you want to talk to.</p>
          <form onSubmit={handleCreateChat} className="space-y-4">
            <Field label="CHAT NAME">
              <input
                type="text"
                value={newChatName}
                onChange={e => setNewChatName(e.target.value)}
                placeholder="e.g. nova"
                className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500/60 transition-colors"
                autoFocus
              />
            </Field>
            <Field label="ENCRYPTION KEY">
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
                  Gen
                </button>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1.5">Encrypts every message. Required again after refresh — stored in your device keyring.</p>
            </Field>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={isEphemeralChat} onChange={e => setIsEphemeralChat(e.target.checked)} className="hidden" />
              {isEphemeralChat ? <ToggleRight className="text-red-500 w-6 h-6" /> : <ToggleLeft className="text-zinc-600 w-6 h-6" />}
              <span className="text-xs text-zinc-400">Ephemeral chat <span className="text-zinc-600">(payloads vanish on disconnect)</span></span>
            </label>
            <button type="submit" className="btn-premium w-full py-2.5 rounded-lg mt-2">
              Create chat
            </button>
          </form>
        </ModalShell>
      )}

      {showJoinModal && (
        <ModalShell onClose={() => { setShowJoinModal(false); setJoinError(false); }} accent="cyan">
          <h3 className="text-white font-bold text-lg mb-1">Join a chat</h3>
          <p className="text-zinc-500 text-xs mb-5">Paste the link code a friend shared with you.</p>
          <form onSubmit={handleJoinSubmit} className="space-y-4">
            {joinError && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
                Invalid code or chat not found.
              </div>
            )}
            <Field label="LINK CODE">
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
          <h3 className="text-white font-bold text-lg mb-1">Rotate key</h3>
          <p className="text-red-400 text-xs mb-5 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
            Rotating the key makes existing messages unreadable. Everyone must rejoin with the new code.
          </p>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <Field label="NEW PASSPHRASE">
              <input
                type="text"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value.toUpperCase())}
                className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-red-500/60 transition-colors tracking-widest"
                autoFocus
              />
            </Field>
            <button type="submit" className="w-full bg-red-500 hover:bg-red-400 text-black py-2.5 rounded-lg text-xs font-bold tracking-widest uppercase transition-colors">
              Rotate key
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
            <h3 className="text-white font-bold text-lg">Enter passphrase</h3>
            <p className="text-zinc-500 text-xs mt-1 text-center">
              {activeChat ? activeChat.name : 'This chat'} is end-to-end encrypted
            </p>
          </div>
          <form onSubmit={handleUnlockSubmit} className="space-y-4">
            {lockoutUntil > clock && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
                Too many attempts. Retry in {Math.ceil((lockoutUntil - clock) / 1000)}s.
              </div>
            )}
            {unlockError && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
                Wrong passphrase. {5 - failedAttempts} attempts left.
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
              Keys for chats you created or joined live in your device keyring — never sent anywhere.
            </p>
          </form>
        </ModalShell>
      )}

      {/* call overlays */}
      <CallOverlay />
      <IncomingCallScreen />
    </div>
  );
};

/* ------------------------- small building blocks ------------------------- */

const Loading = () => (
  <div className="h-full flex items-center justify-center text-[10px] tracking-widest uppercase text-zinc-600">
    Loading…
  </div>
);

const EmptyChatState: React.FC<{ onNewMessage: () => void; onJoin: () => void }> = ({ onNewMessage, onJoin }) => (
  <div className="h-full flex flex-col items-center justify-center gap-5 text-center px-8">
    <div className="w-24 h-24 rounded-full border-2 border-cyan-400/25 bg-cyan-400/[0.05] flex items-center justify-center glow-cyan">
      <MessageCircle className="w-10 h-10 text-cyan-300" />
    </div>
    <div>
      <div className="text-white font-bold text-xl tracking-wide mb-2">Your messages</div>
      <div className="text-zinc-500 text-sm max-w-xs leading-relaxed">
        Send private, end-to-end encrypted messages.<br />No feeds. No reels. No noise.
      </div>
    </div>
    <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
      <button onClick={onNewMessage} className="btn-premium px-6 py-2.5 rounded-lg text-xs">Send message</button>
      <button
        onClick={onJoin}
        className="term-panel term-interactive px-6 py-2.5 rounded-lg text-xs text-zinc-300 hover:text-cyan-300 border border-white/[0.07] transition-colors"
      >
        Join with code
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

export default ChatApp;

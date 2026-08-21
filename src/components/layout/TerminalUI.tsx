import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';
import { FileText, ToggleRight, ToggleLeft, ArrowRight, Download, Paperclip, Plus, KeyRound, X, Edit2, Key, Reply, Lock, LockOpen, Video, Clipboard, Check, Flame, Bot, Menu, Phone, Pin, RotateCcw, Trash2, ChevronLeft, ChevronDown, Search } from 'lucide-react';
import CallOverlay from '../calling/CallOverlay';
import { encodeSteganography, decodeSteganography } from '../../utils/steg';
import ReactMarkdown from 'react-markdown';
import { VoiceRecorder } from '../chat/VoiceRecorder';
import TypewriterText from '../ui/TypewriterText';
import CodeBlock from '../CodeBlock';
import Sidebar, { type ActiveView } from './Sidebar';
import remarkGfm from 'remark-gfm';

// Lazy-loaded views keep the initial bundle tiny (great for legacy laptops).
const VideoTunnel = lazy(() => import('./VideoTunnel').then(m => ({ default: m.VideoTunnel })));
const LogsView = lazy(() => import('../logs/LogsView'));
const AxonAIShell = lazy(() => import('../ai/AxonAIShell'));
const SettingsPanel = lazy(() => import('../settings/SettingsPanel'));

// Lightweight WebAudio ping used for incoming transmission alerts
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

// Generates an EASY, human-rememberable channel passcode (AXON-XXXX, digits only).
// Passcodes are NEVER rendered in the UI — they live in the device keyring
// (localStorage 'axon_device_keys', findable via DevTools > Application >
// Local Storage) and on each chat row's data-code attribute in the DOM.
const generateEasyPasscode = () => `AXON-${Math.floor(1000 + Math.random() * 9000)}`;

// Date separator rendered whenever the feed crosses a calendar-day boundary.
const DayDivider: React.FC<{ day: string }> = ({ day }) => {
  const label = (() => {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (day === today) return 'TODAY';
    if (day === yesterday) return 'YESTERDAY';
    return new Date(day).toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
  })();
  return (
    <div className="flex items-center gap-3 my-1 select-none shrink-0" aria-hidden>
      <span className="h-px flex-1 bg-white/[0.06]" />
      <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.3em] uppercase text-zinc-600">{label}</span>
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
};

export interface TerminalUIProps {
  activeView?: ActiveView;
  setActiveView?: (view: ActiveView) => void;
}

export const TerminalUI: React.FC<TerminalUIProps> = ({
  activeView: propsActiveView,
  setActiveView: propsSetActiveView,
}) => {
  const [internalActiveView, setInternalActiveView] = useState<ActiveView>('dashboard');
  const activeView = propsActiveView !== undefined ? propsActiveView : internalActiveView;
  const setActiveView = propsSetActiveView || setInternalActiveView;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { deviceId, alias, chats, activeChat, messages, latency, setActiveChat, createChat, joinChat, sendMessage, purgeTerminal, addSystemMessage, networkStatus, renameChat, deleteChat, changeChatPassword, onlineUsers, broadcastTyping, typingUsers, deleteMessageLocally, simBotActive, toggleSimBot, unlockedChatId, unlockChat, lockChat, settings, editMessage, toggleReaction, togglePinMessage, markAsRead, resendMessage, startCall } = useCrypto();
  const chatLocked = !!activeChat && unlockedChatId !== activeChat.id;
  const [input, setInput] = useState('');
  const [panicMode, setPanicMode] = useState(false);
  const [isDecoyMode, setIsDecoyMode] = useState(false);
  const [decoyPassphrase] = useState(() => localStorage.getItem('axon_decoy_pass') || 'DECOY123');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // In-chat transmission search (filters the ACTIVE feed only)
  const [chatSearch, setChatSearch] = useState('');
  // Jump-to-latest plumbing
  const [newBelowCount, setNewBelowCount] = useState(0);
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);
  const isNearBottomRef = useRef(true);

  const [showVideoTunnel, setShowVideoTunnel] = useState(false);

  // Stealth mode: obfuscate the feed while the tab is hidden
  const [tabHidden, setTabHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const stealthActive = settings.stealthMode && tabHidden;
  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const [isIdleLocked, setIsIdleLocked] = useState(false);
  const idleTimeoutRef = useRef<any>(null);
  const [keystrokeTimings, setKeystrokeTimings] = useState<number[]>([]);
  const lastKeyTimeRef = useRef<number>(0);

  const [useSteganography, setUseSteganography] = useState(false);
  const [decodedStego, setDecodedStego] = useState<Record<string, string>>({});

  const [aiEngine, setAiEngine] = useState<any>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatPassphrase, setNewChatPassphrase] = useState('');
  const [isEphemeralChat, setIsEphemeralChat] = useState(false);

  const [replyToId, setReplyToId] = useState<string | null>(null);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [targetChatId, setTargetChatId] = useState<string | null>(null);

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTargetId, setUnlockTargetId] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [clock, setClock] = useState(Date.now());

  // Live UTC clock for the title bar / status bar
  const [liveNow, setLiveNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Context menu (right-click on message)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msgId: string } | null>(null);
  // Edit message state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  // Reaction picker
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [animatedMsgs, setAnimatedMsgs] = useState<Set<string>>(new Set());
  const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '💯', '🚀', '👀', '✅'];

  const feedRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const lastMsgCountRef = useRef(0);
  const lastSeenCountRef = useRef(0);

  // Smart auto-scroll: follow the live stream only while the reader is
  // already near the bottom; otherwise tally arrivals into a jump chip so
  // reading history is never yanked away by incoming traffic.
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
      setNewBelowCount(0);
    } else if (messages.length > lastSeenCountRef.current) {
      setNewBelowCount(prev => prev + (messages.length - lastSeenCountRef.current));
    }
    lastSeenCountRef.current = messages.length;
    // Mark visible messages as read (read receipts)
    if (activeChat && !chatLocked) {
      messages.forEach(m => {
        if (m.sender_id !== deviceId && !(m.read_by || []).includes(deviceId)) {
          markAsRead(m.id);
        }
      });
    }
  }, [messages, activeChat, chatLocked, deviceId, markAsRead]);

  // Terminal switch: reset scroll tracking, land on the latest payload.
  useEffect(() => {
    isNearBottomRef.current = true;
    setNewBelowCount(0);
    setChatSearch('');
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ block: 'end' }));
  }, [activeChat?.id]);

  const handleFeedScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    if (nearBottom && !isNearBottomRef.current) setNewBelowCount(0);
    isNearBottomRef.current = nearBottom;
  };

  const jumpToLatest = () => {
    isNearBottomRef.current = true;
    setNewBelowCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  // Glide to a message and pulse-highlight it (pinned banner / reply jumps).
  const flashMessage = (id?: string | null) => {
    if (!id) return;
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightMsgId(id);
    window.setTimeout(() => setHighlightMsgId(prev => (prev === id ? null : prev)), 1600);
  };

  // Incoming transmission alerts (sound + desktop notification)
  useEffect(() => {
    const lastCount = lastMsgCountRef.current;
    const newCount = messages.length;
    if (lastCount > 0 && newCount > lastCount) {
      const latest = messages[messages.length - 1];
      if (latest && latest.sender_id !== deviceId && latest.sender_id !== 'SYSTEM') {
        if (localStorage.getItem('axon_sound_enabled') !== 'false') playPing();
        if (localStorage.getItem('axon_notifications_enabled') === 'true' && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('[AXON LOGS] INCOMING TRANSMISSION', {
              body: `NODE_${latest.sender_id.substring(0, 4)}: ${latest.text?.slice(0, 120) || '[ATTACHMENT / VOICE MEMO]'}`,
              tag: 'axon-incoming',
            });
          } catch {
            /* notifications unavailable */
          }
        }
      }
    }
    lastMsgCountRef.current = newCount;
  }, [messages, deviceId]);

  // Idle Timer
  useEffect(() => {
    const resetIdle = () => {
      if (isIdleLocked) return;
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => {
        setIsIdleLocked(true);
      }, 60000); // 60s idle
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

  // AI Initialization (engine code is dynamic-imported so it never ships in the
  // initial bundle — it only loads when someone actually triggers @AxonNode)
  const initAI = async () => {
    if (aiEngine) return;
    setIsAiLoading(true);
    addSystemMessage('[SYSTEM: INITIALIZING LOCAL WEBGPU AI NODE... THIS MAY TAKE A MOMENT TO CACHE THE MODEL]');
    try {
      const webllm = await import('@mlc-ai/web-llm');
      const engine = new webllm.MLCEngine();
      await engine.reload("Llama-3-8B-Instruct-q4f32_1-MLC");
      setAiEngine(engine);
      addSystemMessage('[SYSTEM: @AxonNode ONLINE. LOCAL AI IS READY.]');
    } catch (e) {
      console.error(e);
      addSystemMessage('[SYSTEM: ERROR STARTING AI. WEBGPU MIGHT NOT BE SUPPORTED.]');
    }
    setIsAiLoading(false);
  };

  // Tick the clock while a lockout cooldown is active, then stop when it expires
  useEffect(() => {
    if (lockoutUntil <= Date.now()) return;
    const t = setInterval(() => {
      setClock(Date.now());
      if (Date.now() >= lockoutUntil) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [lockoutUntil]);

  // Auto-lock gate: whenever the active terminal is locked, demand the passcode.
  // Runs on chat switch and after idle re-auth -> the core security ask.
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

  // Close context menu / reaction picker on outside click or Escape
  useEffect(() => {
    if (!contextMenu && !reactionPickerMsgId) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-ctx-menu]') && !target.closest('[data-reaction-picker]')) {
        setContextMenu(null);
        setReactionPickerMsgId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setReactionPickerMsgId(null);
      }
    };
    document.addEventListener('mousedown', close, { capture: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close, { capture: true });
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu, reactionPickerMsgId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !selectedFile) return;

    if (input.trim() === '/nuke' && activeChat) {
      if (confirm("WARNING: NUCLEAR PROTOCOL INITIATED. THIS WILL PERMANENTLY DESTROY THIS TERMINAL AND ALL DATA GLOBALLY. PROCEED?")) {
        deleteChat(activeChat.id);
        setInput('');
        return;
      }
    }

    const cmd = input.trim();
    const lowerCmd = cmd.toLowerCase();
    const file = settings.allowFiles ? selectedFile : null;
    
    setInput('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      broadcastTyping(false);
    }

    // Slash command interpreter (only if text command)
    if (lowerCmd === '/clear' && !file) {
      purgeTerminal();
      return;
    }
    if (lowerCmd === '/ping' && !file) {
      addSystemMessage(`PING: ${networkStatus === 'ONLINE' ? `WebSocket Latency ${latency}ms` : `${networkStatus} MODE - ROUND TRIP 0ms (LOCAL)`}`);
      return;
    }
    if (lowerCmd === '/help' && !file) {
      addSystemMessage('[COMMANDS]: /clear /ping /help /status /panic /lock (re-lock terminal) /settings /logs /sim on|off (local sandbox node) | /nuke (wipe terminal) | @AxonNode <prompt> (local AI)');
      return;
    }
    if (lowerCmd.startsWith('/sim') && !file) {
      const arg = cmd.split(' ')[1]?.toLowerCase();
      toggleSimBot(arg === 'on' ? true : arg === 'off' ? false : undefined);
      return;
    }
    if (lowerCmd === '/status' && !file) {
      addSystemMessage(`[STATUS] MODE: ${networkStatus} | ALIAS: ${alias} | NODE: ${deviceId.substring(0, 8)} | TERMINALS: ${chats.length} | MESSAGES: ${messages.length} | LATENCY: ${latency}ms`);
      return;
    }
    if (lowerCmd === '/panic' && !file) {
      setPanicMode(true);
      return;
    }
    if (lowerCmd === '/settings' && !file) {
      setActiveView('settings');
      return;
    }
    if (lowerCmd === '/logs' && !file) {
      setActiveView('logs');
      return;
    }
    if (lowerCmd === '/lock' && !file) {
      if (activeChat) lockChat(activeChat.id);
      return;
    }

    let finalFile = file;
    if (file && useSteganography && file.type.startsWith('image/')) {
      const stegoMessage = prompt("Enter secret message to embed via Steganography:");
      if (stegoMessage) {
        try {
          finalFile = await encodeSteganography(file, stegoMessage);
          addSystemMessage('[STEG: PAYLOAD EMBEDDED IN LSB]');
        } catch (e) {
          alert('Steganography encoding failed');
        }
      }
    }

    await sendMessage(cmd, finalFile, replyToId);
    setReplyToId(null);
    setUseSteganography(false);

    // AI Trigger
    if (lowerCmd.includes('@axonnode')) {
      if (!aiEngine && !isAiLoading) {
        initAI().then(async () => {
          // Send prompt after init
          const reply = await generateAIResponse(cmd);
          sendMessage(`[AxonNode]: ${reply}`);
        });
      } else if (aiEngine) {
        generateAIResponse(cmd).then(reply => {
          sendMessage(`[AxonNode]: ${reply}`);
        });
      }
    }
  };

  const generateAIResponse = async (prompt: string) => {
    if (!aiEngine) return "ERROR: AI offline.";
    addSystemMessage('[AxonNode is thinking...]');
    try {
      const messages: any[] = [{ role: 'user', content: prompt }];
      const reply = await aiEngine.chat.completions.create({ messages });
      return reply.choices[0].message.content || 'NO RESPONSE';
    } catch (e) {
      return "ERROR: AI generation failed.";
    }
  };



  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (!typingTimeoutRef.current) {
      broadcastTyping(true);
    } else {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(false);
      typingTimeoutRef.current = null;
    }, 2000);
  };

  const decodeImage = async (id: string, url: string) => {
    try {
      const msg = await decodeSteganography(url);
      setDecodedStego(prev => ({ ...prev, [id]: msg }));
    } catch (e) {
      setDecodedStego(prev => ({ ...prev, [id]: '[NO HIDDEN PAYLOAD]' }));
    }
  };

  const renderFile = (msgId: string, fileUrl: string | null) => {
    if (!fileUrl) return null;
    
    const isImage = fileUrl.match(/\.(jpeg|jpg|gif|png|webp|avif)(\?.*)?$/i) || fileUrl.startsWith('data:image/');
    const isAudio = fileUrl.match(/\.(webm|mp3|ogg|wav|m4a)(\?.*)?$/i) || fileUrl.startsWith('data:audio/');
    const isVideo = fileUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i) || fileUrl.startsWith('data:video/');

    if (isVideo) {
      return (
        <div className="mt-4 p-2 bg-black/40 border border-zinc-800 rounded">
          <video controls src={fileUrl} className="w-full max-h-72 rounded" />
        </div>
      );
    }

    if (isAudio) {
      return (
        <div className="mt-4 p-2 bg-black/40 border border-zinc-800 rounded">
          <audio controls src={fileUrl} className="w-full h-8" />
        </div>
      );
    }
    
    if (isImage) {
      return (
        <div className="mt-2 group relative">
          <img src={fileUrl} alt="Secure Upload" className="max-w-full rounded border border-zinc-800 max-h-64 object-contain bg-black/50" />
          <button 
            onClick={() => decodeImage(msgId, fileUrl)}
            className="absolute top-2 right-2 bg-black/80 p-1 text-xs text-cyan-400 border border-cyan-400/30 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Extract Steg
          </button>
          {decodedStego[msgId] && (
            <div className="mt-2 p-2 bg-indigo-950/40 border border-indigo-500/50 text-indigo-300 text-xs font-mono">
              [STEG DECODED]: {decodedStego[msgId]}
            </div>
          )}
        </div>
      );
    }

    try {
      const file = JSON.parse(fileUrl);
      return (
        <div className="mt-2 border border-emerald-500/30 p-3 max-w-sm flex items-center justify-between bg-[#080808]">
          <div className="flex items-center gap-3 overflow-hidden">
            <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="flex flex-col overflow-hidden">
              <span className="text-white text-xs truncate" title={file.name}>{file.name}</span>
              <span className="text-zinc-500 text-[10px]">{(file.size / 1024 / 1024).toFixed(2)} MB // PGP Locked</span>
            </div>
          </div>
          <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 p-2 shrink-0">
            <Download className="w-4 h-4" />
          </a>
        </div>
      );
    } catch {
      return null;
    }
  };

  const openCreateModal = () => {
    setNewChatName('');
    setNewChatPassphrase(generateEasyPasscode());
    setIsEphemeralChat(false);
    setShowCreateModal(true);
  };

  const handleRenameRequest = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setTargetChatId(chatId);
      setRenameInput(chat.name);
      setShowRenameModal(true);
    }
  };

  const handlePasswordRequest = (chatId: string) => {
    setTargetChatId(chatId);
    setPasswordInput('');
    setShowPasswordModal(true);
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newChatPassphrase.trim().length < 4) {
      alert("Passphrase must be at least 4 characters.");
      return;
    }
    const dup = chats.find(c => c.share_code === newChatPassphrase.trim().toUpperCase());
    if (dup) {
      alert(`PASSPHRASE ALREADY IN USE BY TERMINAL \"${dup.name}\". SET A DIFFERENT PASSWORD FOR THIS CHAT.`);
      return;
    }
    const success = await createChat(newChatName, newChatPassphrase, isEphemeralChat);
    if (success) {
      setShowCreateModal(false);
      setNewChatName('');
      setNewChatPassphrase('');
      setIsEphemeralChat(false);
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

  const handlePasswordKeyDown = () => {
    const now = Date.now();
    if (lastKeyTimeRef.current > 0) {
      setKeystrokeTimings(prev => [...prev, now - lastKeyTimeRef.current]);
    }
    lastKeyTimeRef.current = now;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetChatId || !passwordInput.trim()) return;
    const dup = chats.find(c => c.id !== targetChatId && c.share_code === passwordInput.trim().toUpperCase());
    if (dup) {
      alert(`PASSPHRASE ALREADY IN USE BY TERMINAL \"${dup.name}\". SET A DIFFERENT PASSWORD FOR THIS CHAT.`);
      return;
    }
    await changeChatPassword(targetChatId, passwordInput.trim().toUpperCase());
    setShowPasswordModal(false);
  };

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Keystroke Dynamics Analysis
    const avgKeystroke = keystrokeTimings.length > 0 
      ? keystrokeTimings.reduce((a,b)=>a+b, 0) / keystrokeTimings.length 
      : 0;
    
    const baseline = Number(localStorage.getItem('axon_keystroke_baseline'));
    
    if (!baseline && avgKeystroke > 0) {
      localStorage.setItem('axon_keystroke_baseline', avgKeystroke.toString());
    } else if (baseline > 0 && avgKeystroke > 0) {
      const diff = Math.abs(avgKeystroke - baseline) / baseline;
      if (diff > 0.4) {
        // High deviation -> divert to decoy
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

    const chat = chats.find(c => c.id === unlockTargetId);
    if (chat && unlockChat(chat.id, unlockPassword.trim())) {
      if (activeChat?.id !== chat.id) setActiveChat(chat);
      setShowUnlockModal(false);
      setFailedAttempts(0);
    } else {
      const fails = failedAttempts + 1;
      setFailedAttempts(fails);
      setUnlockError(true);
      if (fails >= 5) {
        // Brute-force protection: lock out for 30s after 5 bad passphrases
        setLockoutUntil(Date.now() + 30000);
        setFailedAttempts(0);
        setUnlockError(false);
      }
    }
  };

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
        <div className="absolute inset-0 bg-black/50 z-10"></div>
        <div className="z-20 flex flex-col items-center">
          <Lock className="w-16 h-16 text-cyan-500 mb-6" />
          <h1 className="text-2xl font-bold tracking-widest text-cyan-400 mb-4 uppercase">BIOMETRIC LOCK ENGAGED</h1>
          <p className="text-zinc-500 text-sm mb-8 text-center max-w-md">Idle limit exceeded. Terminal locked to prevent unauthorized physical access.</p>
          <button 
            onClick={() => {
              if (activeChat) lockChat(activeChat.id);
              setIsIdleLocked(false);
            }}
            className="px-8 py-3 bg-cyan-400/10 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black transition-all uppercase tracking-widest font-bold"
          >
            Re-Authenticate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-app w-full premium-bg text-[#a3a3a3] font-mono overflow-hidden relative scanlines ${isIdleLocked ? 'blur-xl' : ''}`}>

      {/* PREMIUM AMBIENT BACKGROUND (static radial washes + grid + vignette — zero GPU cost) */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grid-overlay" />
        <div className="absolute inset-0 vignette" />
      </div>

      {/* MOBILE SIDEBAR OVERLAY */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/70 z-40 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* ── FULL TERMINAL WINDOW ── */}
      <div className="relative z-10 flex-1 flex flex-col min-h-0 p-2 sm:p-3 lg:p-4 xl:p-5">
        <div className="term-window crt-flicker crt-warmup flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="term-inner-glow" aria-hidden />

          {/* TITLE BAR (traffic lights + session + live clock) */}
          <div className="term-titlebar h-9 shrink-0 flex items-center gap-3 px-3 md:px-4 border-b border-white/[0.07] select-none">
            <div className="flex items-center gap-2 shrink-0" aria-hidden>
              <span className="tl tl-red" />
              <span className="tl tl-amber" />
              <span className="tl tl-green" />
            </div>
            <div className="flex-1 min-w-0 text-center">
              <span className="font-display text-[10px] font-bold tracking-[0.3em] uppercase truncate block">
                <span className="text-gradient phosphor-text">Axon Logs</span>
                <span className="text-zinc-600 hidden sm:inline"> — secure terminal</span>
                <span className="text-emerald-500/70 hidden lg:inline"> // axon@axonlogs:~/secure</span>
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-[9px] md:text-[10px] font-bold tracking-widest uppercase text-zinc-500 tabular-nums">
              <span className="hidden sm:inline text-cyan-500/90">NODE: {deviceId.substring(0, 8)}</span>
              <span className="text-emerald-500/90">{liveNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
            </div>
          </div>

          {/* TERMINAL TAB STRIP (one tab per active terminal) */}
          <div className="term-tabstrip shrink-0 flex items-stretch border-b border-white/[0.06] overflow-x-auto no-scrollbar min-h-[clamp(32px,4vw,40px)]">
            {chats.map(chat => {
              const isTabActive = activeChat?.id === chat.id;
              const isTabLocked = unlockedChatId !== chat.id;
              return (
                <button
                  key={chat.id}
                  onClick={() => setActiveChat(chat)}
                  data-code={chat.share_code}
                  title={`${chat.name}${isTabLocked ? ' [LOCKED]' : ''}`}
                  className={`group relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 min-w-0 shrink-0 border-r border-white/[0.04] transition-all ${
                    isTabActive ? 'bg-[#0b0f16] text-cyan-300' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]'
                  }`}
                >
                  {isTabActive && (
                    <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                  )}
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                    isTabActive 
                      ? (isTabLocked ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]') 
                      : (isTabLocked ? 'bg-amber-400/50' : 'bg-emerald-400/50')
                  }`} />
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase truncate max-w-[6rem] sm:max-w-[7rem] md:max-w-[11rem]">
                    {chat.name}
                  </span>
                  {isTabLocked && (
                    <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-500/60 shrink-0" />
                  )}
                </button>
              );
            })}
            <button
              onClick={openCreateModal}
              title="New terminal"
              className="px-2.5 sm:px-3 md:px-4 shrink-0 flex items-center gap-1 text-zinc-500 hover:text-cyan-300 hover:bg-cyan-400/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase hidden sm:inline">NEW</span>
            </button>
            <div className="flex-1" />
            {activeView !== 'dashboard' && (
              <button
                onClick={() => setActiveView('dashboard')}
                className="hidden sm:flex items-center gap-1.5 px-3 md:px-4 text-[9px] sm:text-[10px] font-bold tracking-widest uppercase text-zinc-500 hover:text-cyan-300 shrink-0 border-l border-white/[0.04] transition-colors"
              >
                <ChevronLeft className="w-3 h-3" /> DASHBOARD
              </button>
            )}
          </div>

          {/* BODY: sidebar + active view */}
          <div className="flex flex-1 min-h-0">

          {/* COLLAPSIBLE NAVIGATION SIDEBAR (drawer on mobile, rail on desktop) */}
          <Sidebar
            activeView={activeView}
            setActiveView={setActiveView}
            isCollapsed={isSidebarCollapsed}
            setIsCollapsed={setIsSidebarCollapsed}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onCreateTunnel={openCreateModal}
            onRenameChat={handleRenameRequest}
            onChangePassword={handlePasswordRequest}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={() => setMobileSidebarOpen(false)}
          />

          {/* MAIN VIEW CONTAINER */}
          <div className="flex-1 flex min-w-0 h-full overflow-hidden relative">
        {activeView === 'dashboard' && (
          <main className="flex-1 flex flex-col min-w-0 glass-panel border-l border-white/[0.04]">
              {/* Top Header */}
              <header className="border-b border-white/[0.05] bg-[#090910] flex items-center justify-between px-3 sm:px-4 md:px-8 gap-2 sm:gap-3 shrink-0 min-h-[clamp(40px,5vw,48px)]">
                <div className="flex items-center gap-3 md:gap-6 text-[10px] font-bold tracking-widest uppercase overflow-hidden min-w-0">
                  <button
                    onClick={() => setMobileSidebarOpen(true)}
                    title="Open Sidebar"
                    className="md:hidden p-1.5 -ml-1.5 text-zinc-400 hover:text-cyan-400 transition-colors shrink-0"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  <button onClick={() => setActiveView('settings')} className="text-zinc-300 hover:text-cyan-400 cursor-pointer transition-colors truncate">
                    ALIAS: {alias}
                  </button>
                  {activeChat && !chatLocked && (
                    <span className="hidden md:inline text-zinc-600 truncate">// {activeChat.name}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 md:gap-3 text-[10px] uppercase tracking-widest font-bold shrink-0">
                  {activeChat && networkStatus === 'LOCAL' && (
                    <button 
                      onClick={() => toggleSimBot()}
                      className={`border px-3 py-1 items-center gap-2 hidden md:flex transition-colors ${simBotActive ? 'bg-amber-500 text-black border-amber-500' : 'border-amber-500/30 text-amber-500 hover:bg-amber-500 hover:text-black'}`}
                    >
                      <Bot size={12} className="inline mr-1" /> SIM NODE {simBotActive ? 'ON' : 'OFF'}
                    </button>
                  )}
                  {activeChat && (
                    <button 
                      onClick={() => setShowVideoTunnel(!showVideoTunnel)}
                      className={`border px-3 py-1 items-center gap-2 hidden md:flex transition-colors ${showVideoTunnel ? 'bg-cyan-500 text-black border-cyan-500' : 'border-cyan-500/30 text-cyan-500 hover:bg-cyan-500 hover:text-black'}`}
                    >
                      <Video size={12} className="inline mr-1" /> COMM-LINK
                    </button>
                  )}
                  {activeChat && (
                    <button 
                      onClick={() => startCall(activeChat, 'audio')}
                      className="border px-2 md:px-3 py-1 items-center gap-1.5 md:gap-2 flex transition-colors border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-black"
                    >
                      <Phone size={12} className="inline" /> <span className="hidden sm:inline">AUDIO</span><span className="sm:hidden">CALL</span>
                    </button>
                  )}
                  {activeChat && (
                    <button 
                      onClick={() => startCall(activeChat, 'video')}
                      className="border px-2 md:px-3 py-1 items-center gap-1.5 md:gap-2 hidden sm:flex transition-colors border-cyan-500/30 text-cyan-500 hover:bg-cyan-500 hover:text-black"
                    >
                      <Video size={12} className="inline mr-1" /> VIDEO
                    </button>
                  )}
                  <button 
                    onClick={purgeTerminal}
                    className="border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 px-3 py-1 transition-colors shrink-0"
                  >
                    <span className="hidden sm:inline">PURGE TERMINAL</span>
                    <span className="sm:hidden">PURGE</span>
                  </button>
                </div>
              </header>

              {/* Sub Header */}
              <div className="px-3 sm:px-4 md:px-8 pt-3 sm:pt-4 md:pt-8 pb-3 sm:pb-4 shrink-0">
                <h2 className="text-white font-bold text-base md:text-lg tracking-widest uppercase mb-1 flex items-center gap-2 md:gap-3 min-w-0">
                  <span className="truncate">
                    <span className="text-gradient">TERMINAL //</span>{' '}                      <span className={chatLocked ? 'text-amber-400' : 'text-cyan-300'}>
                        [{activeChat ? (chatLocked ? 'LOCKED' : activeChat.name) : 'STANDBY'}]
                      </span>
                  </span>
                  {activeChat && !chatLocked && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activeChat.share_code);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 1500);
                      }}
                      title="Copy join code"
                      className="text-zinc-600 hover:text-cyan-400 transition-colors ml-1 shrink-0"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Clipboard className="w-4 h-4" />}
                    </button>
                  )}
                  {activeChat?.share_code.startsWith('EPH-') && !chatLocked && (
                    <span className="text-[10px] bg-red-500/20 text-red-500 px-2 py-0.5 border border-red-500/30 font-bold tracking-[0.2em] animate-pulse shrink-0">
                      EPHEMERAL
                    </span>
                  )}
                  {activeChat && !chatLocked && (
                    <button 
                      onClick={() => {
                        setTargetChatId(activeChat.id);
                        setRenameInput(activeChat.name);
                        setShowRenameModal(true);
                      }}
                      className="text-zinc-600 hover:text-cyan-400 transition-colors ml-2 shrink-0"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  {activeChat && (
                    <button
                      onClick={() => (chatLocked ? setShowUnlockModal(true) : lockChat(activeChat.id))}
                      title={chatLocked ? 'Terminal locked - click to unlock' : 'Lock terminal now'}
                      className={`transition-colors ml-2 shrink-0 ${chatLocked ? 'text-amber-500/80 hover:text-amber-400' : 'text-zinc-600 hover:text-amber-400'}`}
                    >
                      {chatLocked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                    </button>
                  )}
                </h2>
                {activeChat && !chatLocked && (
                  <div className="mt-2 sm:mt-3 flex max-w-md">
                    <div className="flex items-center gap-2 flex-1 min-w-0 term-panel border border-white/[0.07] focus-within:border-cyan-500/50 transition-colors px-3 py-1.5">
                      <Search size={13} className="text-zinc-600 shrink-0" />
                      <input
                        value={chatSearch}
                        onChange={e => setChatSearch(e.target.value)}
                        placeholder="grep transmissions..."
                        aria-label="Search messages in this terminal"
                        className="flex-1 min-w-0 bg-transparent outline-none text-xs font-mono text-white placeholder:text-zinc-600"
                      />
                      {chatSearch.trim() && (
                        <>
                          <span className="text-[9px] font-bold tracking-widest text-cyan-500/80 shrink-0 tabular-nums">
                            {messages.filter(m => (m.text ?? '').toLowerCase().includes(chatSearch.trim().toLowerCase())).length} HITS
                          </span>
                          <button type="button" onClick={() => setChatSearch('')} className="text-zinc-600 hover:text-white shrink-0" title="Clear search">
                            <X size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="dot-live text-emerald-400 w-1.5 h-1.5" />
                  {activeChat ? (
                    <span className="text-emerald-500 text-xs">Uplink Established</span>
                  ) : (
                    <span className="text-emerald-400 text-sm sm:text-base font-semibold tracking-wider animate-pulse">
                      ⚡ Awaiting Connection...
                    </span>
                  )}
                  {activeChat && Object.keys(onlineUsers).length > 0 && (
                    <span className="ml-4 text-cyan-400">
                      ACTIVE NODES: {Object.values(onlineUsers).join(', ')}
                    </span>
                  )}
                  {Object.keys(typingUsers).length > 0 && (
                    <span className="ml-4 text-amber-400 animate-pulse">
                      ◉ {Object.values(typingUsers).join(', ')} IS TYPING...
                    </span>
                  )}
                </div>
              </div>

              {/* Chat Feed */}
              <div className="relative flex-1 min-h-0">
              <div 
                ref={feedRef} 
                onScroll={handleFeedScroll}
                className={`feed-scroll h-full overflow-y-auto px-4 md:px-8 py-4 flex flex-col gap-6 relative transition-[filter,opacity] duration-500 ${stealthActive ? 'blur-xl opacity-30 select-none pointer-events-none' : ''}`}
              >
                {showVideoTunnel && activeChat && (
                  <Suspense fallback={null}>
                    <VideoTunnel onClose={() => setShowVideoTunnel(false)} />
                  </Suspense>
                )}

                {stealthActive && (
                  <div className="sticky top-2 z-20 mx-auto w-max px-4 py-1.5 rounded-full border border-blue-500/40 bg-[#0a1030] text-[10px] font-bold tracking-[0.25em] uppercase text-blue-400 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    Stealth Mode Active
                  </div>
                )}

                {/* Pinned messages banner */}
                {activeChat && !chatLocked && messages.filter(m => m.pinned).length > 0 && (
                  <div className="mx-2 sm:mx-4 mb-2 p-2 sm:p-3 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-amber-400/80 uppercase mb-1.5">
                      <Pin size={10} className="rotate-45" /> PINNED ({messages.filter(m => m.pinned).length})
                    </div>
                    {messages.filter(m => m.pinned).slice(0, 3).map(pm => (
                      <div key={pm.id} className="text-xs text-zinc-400 truncate cursor-pointer hover:text-amber-300 transition-colors py-0.5" onClick={() => flashMessage(pm.id)}>
                        <span className="text-amber-500/60 mr-1">→</span> {pm.text.slice(0, 80)}{pm.text.length > 80 ? '…' : ''}
                      </div>
                    ))}
                  </div>
                )}

                {!activeChat ? (
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-6">
                    <div className="relative">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full term-panel flex items-center justify-center border border-cyan-500/30">
                        <span className="text-3xl sm:text-4xl">⚡</span>
                      </div>
                      <div className="absolute inset-0 rounded-full border-2 border-cyan-400/20 animate-ping" style={{ animationDuration: '3s' }} />
                    </div>
                    <div className="text-center">
                      <div className="phosphor-text text-cyan-300 text-base sm:text-lg font-bold tracking-widest uppercase mb-2">
                        NO CHANNEL SELECTED
                      </div>
                      <div className="text-zinc-500 text-xs sm:text-sm tracking-wider">
                        CREATE OR JOIN A TERMINAL TO INITIATE SECURE TRANSMISSIONS
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={openCreateModal}
                        className="btn-premium px-5 py-2.5 rounded-lg text-xs sm:text-sm flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> CREATE TERMINAL
                      </button>
                      <button
                        onClick={() => {
                          const code = prompt('Enter terminal link code:');
                          if (code) joinChat(code.trim().toUpperCase());
                        }}
                        className="term-panel term-interactive px-5 py-2.5 rounded-lg text-xs sm:text-sm text-zinc-400 hover:text-cyan-300 flex items-center gap-2 border border-white/[0.06] hover:border-cyan-500/30"
                      >
                        <KeyRound className="w-4 h-4" /> JOIN TERMINAL
                      </button>
                    </div>
                  </div>
                ) : chatLocked ? (
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] gap-4">
                    <div className="w-16 h-16 rounded-full term-panel flex items-center justify-center border border-amber-500/40">
                      <Lock className="w-6 h-6 text-amber-400" />
                    </div>
                    <div className="text-center">
                      <div className="phosphor-text text-amber-400 text-sm sm:text-base font-bold tracking-widest uppercase mb-1">
                        TERMINAL LOCKED
                      </div>
                      <div className="text-zinc-500 text-xs tracking-wider">
                        Enter passphrase to decrypt transmissions
                      </div>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] gap-3">
                    <div className="text-zinc-600 text-xs sm:text-sm tracking-widest uppercase">
                      CHANNEL SECURE — AWAITING TRANSMISSIONS
                    </div>
                    <div className="text-zinc-700 text-[10px] sm:text-xs tracking-wider">
                      Type a message below to begin
                    </div>
                  </div>
                ) : (
                  (() => {
                  let lastDay = '';
                  return messages
                    .filter(msg =>
                      (!searchQuery || (msg.text ?? '').toLowerCase().includes(searchQuery.toLowerCase())) &&
                      (!chatSearch.trim() || (msg.text ?? '').toLowerCase().includes(chatSearch.trim().toLowerCase()))
                    )
                    .map(msg => {
                    const isSelf = msg.sender_id === deviceId;
                    const isSystem = msg.sender_id === 'SYSTEM';
                    const msgDay = new Date(msg.created_at).toDateString();
                    const dayChanged = msgDay !== lastDay;
                    lastDay = msgDay;

                    if (isSystem) {
                      return (
                        <React.Fragment key={msg.id}>
                          {dayChanged && <DayDivider day={msgDay} />}
                          <div className="hairline-gradient text-zinc-500 text-xs text-center border-y border-white/[0.05] py-2 my-2">
                            {msg.text}
                          </div>
                        </React.Fragment>
                      );
                    }

                    return (
                      <React.Fragment key={msg.id}>
                      {dayChanged && <DayDivider day={msgDay} />}
                      <div 
                        id={`msg-${msg.id}`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, msgId: msg.id });
                          setReactionPickerMsgId(null);
                        }}
                        className={`flex flex-col w-full max-w-3xl border theme-pad relative group theme-radius transition-all duration-300 ${
                          highlightMsgId === msg.id ? 'ring-2 ring-cyan-400/80 bg-cyan-500/[0.07]' : ''} ${
                          msg.pinned ? 'border-amber-500/40 ring-1 ring-amber-500/20' : ''} ${
                          isSelf 
                            ? 'ml-auto border-cyan-400/40 bg-gradient-to-br from-cyan-500/[0.09] via-cyan-500/[0.02] to-transparent shadow-[0_0_28px_-14px_rgba(34,211,238,0.5)] hover:shadow-[0_0_32px_-12px_rgba(34,211,238,0.65)]' 
                            : 'border-white/[0.07] border-l-2 border-l-emerald-500/60 bg-gradient-to-br from-emerald-500/[0.05] via-transparent to-transparent shadow-[0_0_28px_-16px_rgba(52,211,153,0.35)] hover:shadow-[0_0_32px_-14px_rgba(52,211,153,0.55)]'
                        }`}
                      >
                        {/* Quick action buttons (hover) */}
                        <button 
                          onClick={() => setReplyToId(msg.id)}
                          className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-cyan-400 transition-opacity bg-black/50 p-1 rounded"
                          title="Reply to message"
                        >
                          <Reply size={14} />
                        </button>
                        <button 
                          onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}
                          className="absolute top-4 right-9 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-amber-400 transition-opacity bg-black/50 p-1 rounded text-xs"
                          title="React"
                        >
                          😊
                        </button>
                        {isSelf && (
                          <button 
                            onClick={() => {
                              if (confirm('INCINERATE THIS PAYLOAD? THIS CANNOT BE UNDONE.')) deleteMessageLocally(msg.id);
                            }}
                            className="absolute top-4 right-14 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity bg-black/50 p-1 rounded"
                            title="Incinerate payload"
                          >
                            <Flame size={14} />
                          </button>
                        )}

                        {/* Inline reaction picker */}
                        {reactionPickerMsgId === msg.id && (
                          <div data-reaction-picker className="absolute -top-10 right-4 z-30 flex items-center gap-1 bg-[#0a0f18] border border-white/10 rounded-lg px-2 py-1 shadow-xl">
                            {QUICK_EMOJIS.map(em => (
                              <button key={em} onClick={() => { toggleReaction(msg.id, em); setReactionPickerMsgId(null); }} className="text-sm hover:scale-125 transition-transform">
                                {em}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Pinned indicator */}
                        {msg.pinned && (
                          <div className="text-[10px] text-amber-400 font-mono tracking-widest uppercase mb-1 flex items-center gap-1">
                            <Pin size={10} className="rotate-45" /> PINNED
                          </div>
                        )}

                        <div className="flex justify-between items-center mb-3 pr-8">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${isSelf ? 'text-cyan-400' : 'text-emerald-500'}`}>
                            {isSelf ? alias : `NODE_${msg.sender_id.substring(0,4)}`}
                          </span>
                          <span className="text-[10px] text-zinc-600 flex items-center gap-1.5">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                            {msg.edited && <span className="text-zinc-700 italic">edited</span>}
                            {isSelf && (
                              <span className={msg.read_by && msg.read_by.length > 0 ? 'text-cyan-400' : 'text-zinc-600'}>
                                {msg.read_by && msg.read_by.length > 0 ? '✓✓' : '✓'}
                              </span>
                            )}
                          </span>
                        </div>

                        {msg.reply_to_id && (
                          <div 
                            className="mb-2 p-2 bg-black/20 border-l-2 border-zinc-700 text-xs text-zinc-500 truncate cursor-pointer hover:bg-black/40 transition-colors"
                            onClick={() => flashMessage(msg.reply_to_id)}
                          >
                            ↪ {messages.find(m => m.id === msg.reply_to_id)?.text || 'Audio / Attachment'}
                          </div>
                        )}

                        {/* Edit mode */}
                        {editingMsgId === msg.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && editingText.trim()) {
                                  editMessage(msg.id, editingText.trim());
                                  setEditingMsgId(null);
                                  setEditingText('');
                                } else if (e.key === 'Escape') {
                                  setEditingMsgId(null);
                                  setEditingText('');
                                }
                              }}
                              className="flex-1 bg-black/30 border border-cyan-500/30 text-cyan-300 text-sm font-mono px-3 py-2 focus:outline-none focus:border-cyan-400"
                              autoFocus
                            />
                            <button onClick={() => { if (editingText.trim()) { editMessage(msg.id, editingText.trim()); } setEditingMsgId(null); setEditingText(''); }} className="text-cyan-400 hover:text-cyan-300 text-xs font-mono">SAVE</button>
                            <button onClick={() => { setEditingMsgId(null); setEditingText(''); }} className="text-zinc-500 hover:text-zinc-400 text-xs font-mono">ESC</button>
                          </div>
                        ) : (
                          <div className="theme-text font-mono text-zinc-200 leading-relaxed">
                            {msg.text.startsWith('data:audio/') ? (
                              <audio controls src={msg.text} className="w-full max-w-sm h-9" />
                            ) : (!isSelf && !animatedMsgs.has(msg.id) && Date.now() - new Date(msg.created_at).getTime() < 15000 ? (
                              <TypewriterText
                                text={msg.text}
                                speed={12}
                                onComplete={() => setAnimatedMsgs(prev => new Set(prev).add(msg.id))}
                              />
                            ) : (
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm]} 
                                components={{
                                  code: CodeBlock,
                                  p({children}) { return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p> },
                                  a({href, children}) { return <a href={href} className="text-cyan-500 hover:underline" target="_blank" rel="noreferrer">{children}</a> },
                                  ul({children}) { return <ul className="list-disc pl-4 mb-2">{children}</ul> },
                                  ol({children}) { return <ol className="list-decimal pl-4 mb-2">{children}</ol> },
                                  li({children}) { return <li className="mb-1">{children}</li> },
                                  blockquote({children}) { return <blockquote className="border-l-2 border-zinc-700 pl-3 italic text-zinc-400">{children}</blockquote> }
                                }}
                              >
                                {msg.text}
                              </ReactMarkdown>
                            ))}
                          </div>
                        )}

                        {renderFile(msg.id, msg.file_url)}

                        {/* Reactions display */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-white/[0.05]">
                            {Object.entries(
                              msg.reactions.reduce((acc: Record<string, number>, r) => {
                                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                return acc;
                              }, {})
                            ).map(([emoji, count]) => (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(msg.id, emoji)}
                                className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 bg-black/30 border border-white/10 rounded-full hover:border-cyan-500/40 transition-colors"
                              >
                                <span>{emoji}</span>
                                <span className="text-[10px] text-zinc-500">{count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      </React.Fragment>
                    );
                    });
                  })()
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Jump-to-latest chip — appears when new traffic lands off-screen */}
              {newBelowCount > 0 && (
                <button
                  onClick={jumpToLatest}
                  className="absolute bottom-3 right-3 sm:right-6 z-30 flex items-center gap-1.5 bg-[#0a1220]/95 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold tracking-widest uppercase pl-3 pr-2.5 py-1.5 rounded-full shadow-[0_0_24px_-8px_rgba(34,211,238,0.7)] hover:border-cyan-400 hover:text-white transition-colors"
                >
                  <ChevronDown size={12} /> {newBelowCount} NEW
                </button>
              )}
              </div>

              {/* Footer Input Bar */}
              {activeChat && !chatLocked && (
                <footer className="term-footer border-t border-white/[0.06] shrink-0">
                  {/* Reply preview */}
                  {replyToId && (
                    <div className="flex items-center gap-2 px-3 sm:px-4 md:px-8 py-1.5 bg-cyan-500/[0.04] border-b border-cyan-500/10 text-[10px] sm:text-xs">
                      <Reply size={12} className="text-cyan-400 shrink-0" />
                      <span className="text-zinc-400 truncate flex-1">
                        Replying to: {messages.find(m => m.id === replyToId)?.text?.slice(0, 60) || 'message'}
                      </span>
                      <button type="button" onClick={() => setReplyToId(null)} className="text-zinc-500 hover:text-white shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  {/* File preview */}
                  {selectedFile && (
                    <div className="flex items-center gap-2 px-3 sm:px-4 md:px-8 py-1.5 bg-emerald-500/[0.04] border-b border-emerald-500/10 text-[10px] sm:text-xs">
                      <FileText size={12} className="text-emerald-400 shrink-0" />
                      <span className="text-zinc-400 truncate flex-1">{selectedFile.name}</span>
                      <button type="button" onClick={() => setSelectedFile(null)} className="text-zinc-500 hover:text-white shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <form onSubmit={handleSubmit} className="flex items-center gap-1.5 sm:gap-2 md:gap-3 px-2.5 sm:px-3 md:px-8 py-2 sm:py-2.5 md:py-3 focus-within:shadow-[inset_0_0_30px_-15px_rgba(34,211,238,0.15)] transition-shadow duration-300">
                    {/* Shell prompt */}
                    <span className="text-[11px] md:text-xs font-bold shrink-0 select-none whitespace-nowrap" aria-hidden>
                      <span className="text-emerald-400">axon</span>
                      <span className="text-zinc-600">@</span>
                      <span className="text-cyan-400">node</span>
                      <span className="text-zinc-600">:</span>
                      <span className="text-cyan-300">~</span>
                      <span className="text-emerald-400">$</span>
                    </span>
                    <input 
                      type="text" 
                      value={input}
                      onChange={handleInputChange}
                      placeholder="type a transmission... (or /help for commands)"
                      className="axon-caret flex-1 min-w-0 bg-transparent outline-none theme-text text-white font-mono placeholder:text-zinc-600 placeholder:normal-case py-2.5"
                    />

                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                      }}
                    />
                    {settings.allowFiles && (
                      <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-zinc-500 hover:text-emerald-400 transition-colors shrink-0"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                    )}
                    
                    {settings.allowVoice && (
                      <VoiceRecorder 
                        onRecordingComplete={(base64Audio) => {
                          if (activeChat && base64Audio) {
                            sendMessage(base64Audio, null, replyToId);
                            setReplyToId(null);
                          }
                        }} 
                      />
                    )}
                    
                    <button 
                      type="submit"
                      disabled={(!input.trim() && !selectedFile)}
                      className="btn-premium px-4 sm:px-6 py-2 rounded-md text-xs flex items-center gap-2 shrink-0"
                    >
                      <span className="hidden sm:inline">EXECUTE</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                </footer>
              )}
          </main>
        )}

        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[10px] tracking-widest uppercase text-zinc-600">[ LOADING MODULE... ]</div>}>
          {activeView === 'axon-ai' && <AxonAIShell />}
          {activeView === 'settings' && <SettingsPanel />}
          {activeView === 'logs' && <LogsView />}
        </Suspense>
          </div>
          </div>

          {/* ── STATUS BAR (tmux-style) ── */}
          <div className="term-statusbar shrink-0 border-t border-white/[0.07] flex items-center gap-2 sm:gap-3 md:gap-4 px-2 sm:px-3 md:px-4 text-[8px] sm:text-[9px] md:text-[10px] font-bold tracking-widest uppercase select-none min-h-[28px] md:min-h-[32px]">
            <span className={`flex items-center gap-1.5 shrink-0 ${networkStatus === 'ONLINE' || networkStatus === 'LOCAL' ? 'text-emerald-400' : 'text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full dot-live ${networkStatus === 'ONLINE' || networkStatus === 'LOCAL' ? 'text-emerald-400' : 'text-red-400'}`} />
              <span className="hidden sm:inline">{networkStatus === 'ONLINE' ? 'GLOBAL SYNC' : networkStatus === 'LOCAL' ? 'DEVICE-ONLY' : (networkStatus || 'OFFLINE')}</span>
              <span className="sm:hidden">{networkStatus === 'ONLINE' ? 'ONLINE' : networkStatus === 'LOCAL' ? 'LOCAL' : 'OFF'}</span>
            </span>
            {activeChat && (
              <span className="text-zinc-400 truncate min-w-0 hidden md:inline">TERM: {activeChat.name}</span>
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

      {/* MODALS & OVERLAYS */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
          <div
            data-hint="Passcode is stored on this device only: DevTools > Application > Local Storage > axon_device_keys. Never displayed in the UI."
            className="term-panel border-emerald-500/40 w-full max-w-md p-6 relative theme-radius overflow-hidden"
          >
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500" />
            <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-emerald-500 font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5" /> CREATE TUNNEL
            </h3>
            
            <form onSubmit={handleCreateChat} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">TUNNEL ALIAS</label>
                <input 
                  type="text" 
                  value={newChatName}
                  onChange={e => setNewChatName(e.target.value.toUpperCase())}
                  placeholder="e.g. ALPHA-OPERATIONS"
                  className="w-full term-input border border-white/[0.05] focus:border-emerald-500 p-2 text-white font-mono text-sm outline-none uppercase transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">ENCRYPTION PASSPHRASE</label>
                <input 
                  type="password" 
                  value={newChatPassphrase}
                  onChange={e => setNewChatPassphrase(e.target.value.toUpperCase())}
                  placeholder="SHARED SECRET"
                  className="w-full term-input border border-white/[0.05] focus:border-emerald-500 p-2 text-white font-mono text-sm outline-none uppercase transition-all"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-emerald-500 tracking-widest uppercase">
                    EASY PASSCODE — EASY TO SHARE & REMEMBER
                  </span>
                  <button type="button" onClick={() => setNewChatPassphrase(generateEasyPasscode())} className="text-[10px] text-emerald-500 hover:text-emerald-400 tracking-widest uppercase">
                    [ REGENERATE ]
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1 leading-relaxed">
                  Encrypts all messages & is required to re-enter after refresh. Never shown again.
                </p>
              </div>
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={isEphemeralChat} onChange={e => setIsEphemeralChat(e.target.checked)} className="hidden" />
                  {isEphemeralChat ? <ToggleRight className="text-red-500 w-6 h-6" /> : <ToggleLeft className="text-zinc-600 w-6 h-6" />}
                  <span className="text-xs text-zinc-400">Ephemeral Channel (Destroy payload on disconnection)</span>
                </label>
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-2 text-xs font-bold tracking-widest uppercase transition-colors">
                  INITIALIZE TUNNEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRenameModal && (
        <div className="fixed inset-0 bg-black/80 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="term-panel border-cyan-500/40 w-full max-w-md p-6 relative theme-radius overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-cyan-500" />
            <button onClick={() => setShowRenameModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-cyan-400 font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
              <Edit2 className="w-5 h-5" /> RENAME TERMINAL
            </h3>
            
            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">NEW TERMINAL ALIAS</label>
                <input 
                  type="text" 
                  value={renameInput}
                  onChange={e => setRenameInput(e.target.value.toUpperCase())}
                  className="w-full term-input border border-white/[0.05] focus:border-cyan-500 p-2 text-white font-mono text-sm outline-none uppercase transition-all"
                  autoFocus
                />
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-cyan-400 hover:bg-cyan-300 text-black py-2 text-xs font-bold tracking-widest uppercase transition-colors">
                  UPDATE ALIAS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/80 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="term-panel border-red-500/45 w-full max-w-md p-6 relative theme-radius overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500" />
            <button onClick={() => setShowPasswordModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-red-500 font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
              <Key className="w-5 h-5" /> KEY ROTATION
            </h3>
            
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs mb-4">
                WARNING: Changing the terminal password will rotate the encryption key. Existing messages will become unreadable!
              </div>
              <div>
                <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">NEW PASSPHRASE</label>                <input 
                  type="text" 
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value.toUpperCase())}

                  className="w-full term-input border border-white/[0.05] focus:border-red-500 p-2 text-white font-mono text-sm outline-none uppercase transition-all"
                  autoFocus
                />
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-red-500 hover:bg-red-400 text-black py-2 text-xs font-bold tracking-widest uppercase transition-colors">
                  EXECUTE KEY ROTATION
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUnlockModal && (
        <div className="fixed inset-0 bg-black/80 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
          <div
            data-hint="Recovery: right-click a terminal row and inspect its data-code attribute, or DevTools > Application > Local Storage > axon_device_keys."
            className="term-panel border-emerald-500/40 w-full max-w-md p-6 relative theme-radius overflow-hidden"
          >
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500" />
            <button onClick={() => setShowUnlockModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-emerald-500 font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
              <KeyRound className="w-5 h-5" /> UNLOCK TERMINAL
            </h3>
            
            <form onSubmit={handleUnlockSubmit} className="space-y-4">
              {lockoutUntil > clock && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-500 text-xs mb-2">
                  [LOCKOUT ENGAGED] TOO MANY FAILED ATTEMPTS. RETRY IN {Math.ceil((lockoutUntil - clock) / 1000)}S.
                </div>
              )}
              {unlockError && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-500 text-xs mb-2">
                  ERROR: INVALID PASSPHRASE PROVIDED. ({5 - failedAttempts} ATTEMPTS REMAINING)
                </div>
              )}
              <div>
                <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">PASSCODE</label>
                <input 
                  type="password" 
                  value={unlockPassword}
                  onChange={e => setUnlockPassword(e.target.value.toUpperCase())}
                  onKeyDown={handlePasswordKeyDown}
                  disabled={lockoutUntil > clock}
                  className="w-full term-input border border-white/[0.05] focus:border-emerald-500 p-2 text-white font-mono text-sm outline-none uppercase disabled:opacity-50 transition-all"
                  autoFocus
                />
                <p className="text-[10px] text-zinc-600 mt-1.5 leading-relaxed">
                  Hidden by design. Enter the terminal's passcode to decrypt.
                </p>
              </div>
              <div className="pt-4">
                <button type="submit" disabled={lockoutUntil > clock} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-2 text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  DECRYPT & ENTER
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RIGHT-CLICK CONTEXT MENU */}
      {contextMenu && (
        <div 
          data-ctx-menu
          className="fixed z-[150] bg-[#0a0f18] border border-white/10 shadow-2xl min-w-[180px] py-1"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - 280),
          }}
        >
          {(() => {
            const msg = messages.find(m => m.id === contextMenu.msgId);
            if (!msg) return null;
            const isSelf = msg.sender_id === deviceId;
            return (
              <>
                <button onClick={() => { setReplyToId(msg.id); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-cyan-400 transition-colors font-mono">
                  <Reply size={12} /> Reply
                </button>
                <button onClick={() => { setReactionPickerMsgId(msg.id); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-amber-400 transition-colors font-mono">
                  😊 React
                </button>
                <button onClick={() => { togglePinMessage(msg.id); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-amber-400 transition-colors font-mono">
                  <Pin size={12} /> {msg.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button onClick={() => { navigator.clipboard.writeText(msg.text || ''); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-emerald-400 transition-colors font-mono">
                  <Clipboard size={12} /> Copy Text
                </button>
                {isSelf && (
                  <button onClick={() => { setEditingMsgId(msg.id); setEditingText(msg.text); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-cyan-400 transition-colors font-mono">
                    <Edit2 size={12} /> Edit
                  </button>
                )}
                {isSelf && (
                  <button onClick={() => { resendMessage(msg.id); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-emerald-400 transition-colors font-mono">
                    <RotateCcw size={12} /> Resend
                  </button>
                )}
                {isSelf && (
                  <>
                    <div className="border-t border-white/5 my-1" />
                    <button onClick={() => { if (confirm('INCINERATE THIS PAYLOAD?')) deleteMessageLocally(msg.id); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors font-mono">
                      <Trash2 size={12} /> Delete
                    </button>
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* CALL OVERLAY */}
      <CallOverlay />

    </div>
  );
};

export default TerminalUI;

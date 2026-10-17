import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft, Phone, Video, Info, Paperclip, SendHorizontal, Flame, X,
  Reply, Pin, Clipboard, Edit2, RotateCcw, Trash2, Lock, LockOpen,
  ChevronDown, Search, Check, KeyRound, Archive, Smile,
} from 'lucide-react';
import { useCrypto, type Chat } from '../../contexts/CryptoContext';
import { dmDisplayName } from '../../utils/auth';
import Avatar from '../profile/Avatar';
import { VoiceRecorder } from '../chat/VoiceRecorder';
import TypewriterText from '../ui/TypewriterText';
import { markChatReadUpToNow } from '../../utils/chatMeta';

const QUICK_EMOJIS = ['❤️', '👍', '😂', '🔥', '💯', '🚀', '👀', '😮'];
const HEART = '❤️';

export interface ConversationPanelProps {
  chat: Chat;
  onBack: () => void;
  onRequestRename: (chatId: string) => void;
  onRequestKeyRotation: (chatId: string) => void;
  onTriggerPanic: () => void;
}

const DayDivider: React.FC<{ day: string }> = ({ day }) => {
  const label = (() => {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (day === today) return 'TODAY';
    if (day === yesterday) return 'YESTERDAY';
    return new Date(day).toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
  })();
  return (
    <div className="flex items-center gap-3 my-3 select-none shrink-0" aria-hidden>
      <span className="h-px flex-1 bg-white/[0.06]" />
      <span className="text-[9px] font-bold tracking-[0.3em] uppercase text-zinc-600">{label}</span>
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
};

export const ConversationPanel: React.FC<ConversationPanelProps> = ({
  chat,
  onBack,
  onRequestRename,
  onRequestKeyRotation,
  onTriggerPanic,
}) => {
  const {
    deviceId, messages, latency, sendMessage, purgeTerminal, addSystemMessage,
    networkStatus, deleteMessageLocally, broadcastTyping, typingUsers, onlineUsers,
    unlockedChatId, lockChat, settings, editMessage, toggleReaction, togglePinMessage,
    markAsRead, resendMessage, startCall, deleteChat, archiveChat, account,
  } = useCrypto();

  const myHandle = account?.username?.toLowerCase() || '';
  // DM channels show the other person's handle (Instagram behavior)
  const displayName = myHandle ? dmDisplayName(chat.name, myHandle) : chat.name;

  const chatLocked = unlockedChatId !== chat.id;
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [burnNext, setBurnNext] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msgId: string } | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [animatedMsgs, setAnimatedMsgs] = useState<Set<string>>(new Set());
  const [heartBurst, setHeartBurst] = useState<{ msgId: string; key: number } | null>(null);
  const [newBelowCount, setNewBelowCount] = useState(0);
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);

  const feedRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const isNearBottomRef = useRef(true);
  const lastSeenCountRef = useRef(0);
  const lastTapRef = useRef<{ id: string; t: number }>({ id: '', t: 0 });

  const isOnline = networkStatus === 'ONLINE';
  const peerOnline = Object.keys(onlineUsers).length > 0;

  /* -------- smart auto-scroll (follow only when near bottom) -------- */
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
      setNewBelowCount(0);
    } else if (messages.length > lastSeenCountRef.current) {
      setNewBelowCount(prev => prev + (messages.length - lastSeenCountRef.current));
    }
    lastSeenCountRef.current = messages.length;
  }, [messages]);

  // Read receipts: while the feed is open, visible and decrypted
  useEffect(() => {
    if (chatLocked || document.hidden) return;
    let dirty = false;
    messages.forEach(m => {
      if (m.sender_id !== deviceId && m.sender_id !== 'SYSTEM' && !(m.read_by || []).includes(deviceId)) {
        markAsRead(m.id);
        dirty = true;
      }
    });
    if (dirty || messages.length > 0) markChatReadUpToNow(chat.id);
  }, [messages, chatLocked, chat.id, deviceId, markAsRead]);

  // Reset scroll state when the chat changes
  useEffect(() => {
    isNearBottomRef.current = true;
    setNewBelowCount(0);
    setChatSearch('');
    setSearchOpen(false);
    setReplyToId(null);
    setBurnNext(false);
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ block: 'end' }));
  }, [chat.id]);

  // Close menus on outside click / Escape
  useEffect(() => {
    if (!contextMenu && !reactionPickerMsgId && !optionsOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-ctx-menu]') && !t.closest('[data-reaction-picker]') && !t.closest('[data-options-menu]')) {
        setContextMenu(null);
        setReactionPickerMsgId(null);
        setOptionsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setReactionPickerMsgId(null);
        setOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', close, { capture: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close, { capture: true });
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu, reactionPickerMsgId, optionsOpen]);

  const jumpToLatest = () => {
    isNearBottomRef.current = true;
    setNewBelowCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const flashMessage = (id?: string | null) => {
    if (!id) return;
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightMsgId(id);
    window.setTimeout(() => setHighlightMsgId(prev => (prev === id ? null : prev)), 1600);
  };

  /* ---------------------------- composer ---------------------------- */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (!typingTimeoutRef.current) broadcastTyping(true);
    else clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(false);
      typingTimeoutRef.current = null;
    }, 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd && !selectedFile) return;

    setInput('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      broadcastTyping(false);
    }

    // Quiet power-commands (hidden, zero clutter)
    if (cmd === '/clear' && !selectedFile) { purgeTerminal(); return; }
    if (cmd === '/lock' && !selectedFile) { lockChat(chat.id); return; }
    if (cmd === '/panic' && !selectedFile) { onTriggerPanic(); return; }
    if (cmd === '/ping' && !selectedFile) {
      addSystemMessage(`PING: ${isOnline ? `${latency}ms` : 'LOCAL MODE — 0ms'}`);
      return;
    }

    const file = settings.allowFiles ? selectedFile : null;
    await sendMessage(cmd, file, replyToId, burnNext);
    setReplyToId(null);
    setBurnNext(false);
  };

  /* ------------------- double-tap heart (Instagram) ------------------ */
  const bubbleTap = (msgId: string) => {
    const now = Date.now();
    if (lastTapRef.current.id === msgId && now - lastTapRef.current.t < 380) {
      lastTapRef.current = { id: '', t: 0 };
      const msg = messages.find(m => m.id === msgId);
      const alreadyMine = msg?.reactions?.some(r => r.emoji === HEART && r.user_id === deviceId);
      if (!alreadyMine) toggleReaction(msgId, HEART);
      setHeartBurst({ msgId, key: now });
      window.setTimeout(() => setHeartBurst(prev => (prev?.msgId === msgId ? null : prev)), 900);
    } else {
      lastTapRef.current = { id: msgId, t: now };
    }
  };

  const renderFile = (fileUrl: string | null) => {
    if (!fileUrl) return null;
    const isImage = fileUrl.match(/\.(jpeg|jpg|gif|png|webp|avif)(\?.*)?$/i) || fileUrl.startsWith('data:image/');
    const isAudio = fileUrl.match(/\.(webm|mp3|ogg|wav|m4a)(\?.*)?$/i) || fileUrl.startsWith('data:audio/');
    const isVideo = fileUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i) || fileUrl.startsWith('data:video/');

    if (isVideo) return <video controls src={fileUrl} className="mt-1.5 w-full max-h-72 rounded-xl bg-black/50" />;
    if (isAudio) return <audio controls src={fileUrl} className="mt-1.5 w-full max-w-xs h-9" />;
    if (isImage) return <img src={fileUrl} alt="Shared" className="mt-1.5 max-w-full max-h-72 rounded-xl object-contain bg-black/50 border border-white/10" />;

    try {
      const file = JSON.parse(fileUrl);
      return (
        <div className="mt-1.5 border border-white/10 p-2.5 rounded-xl flex items-center justify-between bg-black/30 max-w-xs">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <span className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 text-[10px] font-bold shrink-0">
              {String(file.name || 'F').slice(0, 2).toUpperCase()}
            </span>
            <div className="flex flex-col overflow-hidden">
              <span className="text-white text-xs truncate">{file.name}</span>
              <span className="text-zinc-500 text-[10px]">{((file.size || 0) / 1024 / 1024).toFixed(2)} MB · encrypted</span>
            </div>
          </div>
          <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 p-1.5 shrink-0">
            <ArrowLeft className="w-4 h-4 rotate-135" />
          </a>
        </div>
      );
    } catch {
      return null;
    }
  };

  /* ---------------------------- rendering ---------------------------- */
  const visibleMessages = messages.filter(
    m => !chatSearch.trim() || (m.text ?? '').toLowerCase().includes(chatSearch.trim().toLowerCase())
  );
  const lastOwnMsg = [...visibleMessages].reverse().find(m => m.sender_id === deviceId);
  const ownSeen = !!lastOwnMsg && (lastOwnMsg.read_by || []).length > 0;
  const pinned = messages.filter(m => m.pinned);

  let lastDay = '';
  let prevSender: string | null = null;
  let prevTime = 0;

  return (
    <section className="h-full flex flex-col min-w-0 bg-[#05060b]/40">
      {/* ------------------------- Header ------------------------- */}
      <header className="shrink-0 border-b border-white/[0.06] bg-[#07070d]/80 backdrop-blur-sm relative z-20">
        <div className="flex items-center gap-2.5 px-2.5 sm:px-4 h-[60px]">
          <button onClick={onBack} className="md:hidden p-1.5 text-zinc-400 hover:text-white transition-colors" title="Back to inbox">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Avatar seed={displayName} name={displayName} size={40} online={!chatLocked && peerOnline} onClick={onBack} className="hidden sm:inline-flex md:inline-flex" />
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onBack} title="Conversation info">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white truncate">{displayName}</span>
              {chat.share_code.startsWith('EPH-') && (
                <span className="text-[8px] font-bold tracking-widest text-red-400 border border-red-500/30 bg-red-500/10 rounded px-1 py-px shrink-0">EPHEMERAL</span>
              )}
            </div>
            <div className="text-[10px] tracking-wide truncate">
              {chatLocked ? (
                <span className="text-amber-400 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Locked — end-to-end encrypted</span>
              ) : isTypingHere() ? (
                <span className="text-emerald-400">typing…</span>
              ) : peerOnline ? (
                <span className="text-emerald-400">Active now{latency > 0 && isOnline ? <span className="text-zinc-600"> · {latency}ms</span> : null}</span>
              ) : (
                <span className="text-zinc-500">Offline · AES-256 encrypted</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setSearchOpen(v => !v)}
              title="Search in conversation"
              className={`p-2 rounded-full transition-colors ${searchOpen ? 'text-cyan-300 bg-cyan-400/10' : 'text-zinc-400 hover:text-cyan-300 hover:bg-white/5'}`}
            >
              <Search className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => !chatLocked && startCall(chat, 'audio')}
              title="Voice call"
              className="p-2 rounded-full text-zinc-400 hover:text-emerald-300 hover:bg-white/5 transition-colors disabled:opacity-40"
              disabled={chatLocked}
            >
              <Phone className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => !chatLocked && startCall(chat, 'video')}
              title="Video call"
              className="p-2 rounded-full text-zinc-400 hover:text-cyan-300 hover:bg-white/5 transition-colors disabled:opacity-40"
              disabled={chatLocked}
            >
              <Video className="w-[18px] h-[18px]" />
            </button>
            <div className="relative">
              <button
                onClick={() => setOptionsOpen(v => !v)}
                data-options-menu
                title="Conversation options"
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Info className="w-[18px] h-[18px]" />
              </button>
              {optionsOpen && (
                <div data-options-menu className="absolute right-0 top-full mt-2 w-60 z-50 term-panel rounded-xl py-1.5 shadow-2xl border border-white/10">
                  <div className="px-3 py-1.5 text-[9px] font-bold tracking-[0.25em] text-zinc-600 uppercase border-b border-white/[0.06] mb-1 truncate">
                    {displayName}
                  </div>
                  <MenuRow icon={<Edit2 className="w-3.5 h-3.5" />} label="Rename" onClick={() => { setOptionsOpen(false); onRequestRename(chat.id); }} />
                  <MenuRow
                    icon={<Clipboard className="w-3.5 h-3.5" />}
                    label="Copy join code"
                    onClick={() => {
                      navigator.clipboard.writeText(chat.share_code);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 1500);
                      setOptionsOpen(false);
                    }}
                    trailing={copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : undefined}
                  />
                  <MenuRow
                    icon={chatLocked ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    label={chatLocked ? 'Unlock chat' : 'Lock chat'}
                    onClick={() => { setOptionsOpen(false); if (chatLocked) { onBack(); } else lockChat(chat.id); }}
                  />
                  <MenuRow icon={<KeyRound className="w-3.5 h-3.5" />} label="Rotate key" onClick={() => { setOptionsOpen(false); onRequestKeyRotation(chat.id); }} danger />
                  <MenuRow
                    icon={<Archive className="w-3.5 h-3.5" />}
                    label="Archive"
                    onClick={() => { setOptionsOpen(false); if (confirm(`Archive "${chat.name}"? You can restore it later.`)) { archiveChat(chat.id); onBack(); } }}
                  />
                  <MenuRow icon={<Trash2 className="w-3.5 h-3.5" />} label="Purge messages" onClick={() => { setOptionsOpen(false); purgeTerminal(); }} danger />
                  <div className="border-t border-white/[0.06] my-1" />
                  <MenuRow
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    label="Delete everywhere"
                    onClick={() => { setOptionsOpen(false); if (confirm(`Permanently delete "${chat.name}" and ALL its messages globally?`)) { deleteChat(chat.id); onBack(); } }}
                    danger
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* In-conversation search strip */}
        {searchOpen && !chatLocked && (
          <div className="px-3 pb-2.5 flex items-center gap-2">
            <div className="flex items-center gap-2 flex-1 bg-white/[0.045] border border-white/[0.06] rounded-lg px-3 py-1.5 focus-within:border-cyan-400/40 transition-colors">
              <Search className="w-3 h-3 text-zinc-500" />
              <input
                value={chatSearch}
                onChange={e => setChatSearch(e.target.value)}
                placeholder="Search this conversation…"
                className="flex-1 bg-transparent outline-none text-xs text-white placeholder:text-zinc-600"
              />
              {chatSearch.trim() && (
                <span className="text-[9px] font-bold tracking-widest text-cyan-500/80 tabular-nums">
                  {visibleMessages.length} HITS
                </span>
              )}
              {chatSearch.trim() && (
                <button onClick={() => setChatSearch('')} className="text-zinc-500 hover:text-white"><X className="w-3 h-3" /></button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* --------------------------- Feed --------------------------- */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={feedRef}
          onScroll={() => {
            const el = feedRef.current;
            if (!el) return;
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
            if (nearBottom && !isNearBottomRef.current) setNewBelowCount(0);
            isNearBottomRef.current = nearBottom;
          }}
          className={`feed-scroll h-full overflow-y-auto px-3 sm:px-5 py-4 flex flex-col relative ${chatLocked ? 'items-center justify-center' : ''}`}
        >
          {chatLocked ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full term-panel flex items-center justify-center border border-amber-500/40">
                <Lock className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <div className="text-amber-400 text-sm font-bold tracking-widest uppercase mb-1">Chat locked</div>
                <div className="text-zinc-500 text-xs">Enter the passphrase to decrypt this conversation.</div>
              </div>
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
              <Avatar seed={displayName} name={displayName} size={84} ring="story" />
              <div className="text-white font-bold text-sm tracking-wide mt-2">{displayName}</div>
              <div className="text-zinc-500 text-xs">End-to-end encrypted · burn-on-read ready</div>
              <div className="text-zinc-600 text-[10px] tracking-widest uppercase mt-1">Say hi — no logs are kept</div>
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <div className="mb-3 p-2.5 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl shrink-0">
                  <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-widest text-amber-400/80 uppercase mb-1">
                    <Pin size={10} className="rotate-45" /> Pinned ({pinned.length})
                  </div>
                  {pinned.slice(0, 3).map(pm => (
                    <div key={pm.id} className="text-xs text-zinc-400 truncate cursor-pointer hover:text-amber-300 py-0.5" onClick={() => flashMessage(pm.id)}>
                      <span className="text-amber-500/60 mr-1">→</span> {(pm.text || '').slice(0, 80)}
                    </div>
                  ))}
                </div>
              )}

              {visibleMessages.map(msg => {
                const isSelf = msg.sender_id === deviceId;
                const isSystem = msg.sender_id === 'SYSTEM';
                const msgDay = new Date(msg.created_at).toDateString();
                const dayChanged = msgDay !== lastDay;
                lastDay = msgDay;

                const t = new Date(msg.created_at).getTime();
                const grouped = !dayChanged && prevSender === msg.sender_id && t - prevTime < 5 * 60 * 1000;
                prevSender = msg.sender_id;
                prevTime = t;

                if (isSystem) {
                  return (
                    <div key={msg.id} className="hairline-gradient text-zinc-500 text-[11px] text-center border-y border-white/[0.05] py-1.5 my-2 rounded">
                      {msg.text}
                    </div>
                  );
                }

                const reactions = msg.reactions || [];
                const hearted = reactions.some(r => r.emoji === HEART);

                return (
                  <React.Fragment key={msg.id}>
                    {dayChanged && <DayDivider day={msgDay} />}
                    <div
                      id={`msg-${msg.id}`}
                      className={`flex items-end gap-2 w-full ${isSelf ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-2.5'} group/msg`}
                      onClick={() => bubbleTap(msg.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, msgId: msg.id });
                        setReactionPickerMsgId(null);
                      }}
                    >
                      {!isSelf && (
                        <div className={grouped ? 'w-7 shrink-0' : ''}>
                          {!grouped && <Avatar seed={msg.sender_id} name={`NODE_${msg.sender_id.substring(0, 4)}`} size={28} />}
                        </div>
                      )}

                      <div className={`relative max-w-[78%] sm:max-w-[64%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col`}>
                        {/* hover quick actions */}
                        <div className={`absolute -top-3 ${isSelf ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} z-10 hidden sm:flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity`}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id); }}
                            className="w-6 h-6 rounded-full bg-[#0b0d15] border border-white/10 flex items-center justify-center text-[10px] hover:scale-110 transition-transform"
                            title="React"
                          >
                            <Smile className="w-3 h-3 text-zinc-400" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setReplyToId(msg.id); }}
                            className="w-6 h-6 rounded-full bg-[#0b0d15] border border-white/10 flex items-center justify-center hover:scale-110 transition-transform"
                            title="Reply"
                          >
                            <Reply className="w-3 h-3 text-zinc-400" />
                          </button>
                          {isSelf && (
                            <button
                              onClick={(e) => { e.stopPropagation(); if (confirm('Incinerate this payload permanently?')) deleteMessageLocally(msg.id); }}
                              className="w-6 h-6 rounded-full bg-[#0b0d15] border border-white/10 flex items-center justify-center hover:scale-110 transition-transform"
                              title="Burn (delete)"
                            >
                              <Flame className="w-3 h-3 text-red-400" />
                            </button>
                          )}
                        </div>

                        {/* inline reaction picker */}
                        {reactionPickerMsgId === msg.id && (
                          <div
                            data-reaction-picker
                            className={`absolute -top-9 ${isSelf ? 'right-0' : 'left-0'} z-30 flex items-center gap-0.5 bg-[#0a0f18] border border-white/10 rounded-full px-2 py-1 shadow-xl`}
                            onClick={e => e.stopPropagation()}
                          >
                            {QUICK_EMOJIS.map(em => (
                              <button
                                key={em}
                                onClick={() => { toggleReaction(msg.id, em); setReactionPickerMsgId(null); }}
                                className={`text-base hover:scale-125 transition-transform ${em === HEART ? 'drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]' : ''}`}
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* reply quote */}
                        {msg.reply_to_id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); flashMessage(msg.reply_to_id); }}
                            className={`mb-1 max-w-full text-left px-3 py-1.5 rounded-2xl bg-white/[0.04] border-l-2 border-cyan-400/60 text-[11px] text-zinc-400 truncate hover:bg-white/[0.07] transition-colors ${isSelf ? 'border-r-2 border-r-cyan-400/60 border-l-transparent' : ''}`}
                          >
                            {messages.find(m => m.id === msg.reply_to_id)?.text?.slice(0, 70) || 'Attachment / voice memo'}
                          </button>
                        )}

                        {/* the bubble */}
                        <div
                          className={`relative px-3.5 py-2 text-sm leading-relaxed transition-all ${
                            highlightMsgId === msg.id ? 'ring-2 ring-cyan-400/80' : ''
                          } ${
                            isSelf
                              ? 'bubble-mine text-white'
                              : 'bubble-theirs text-zinc-100'
                          } ${msg.burn_on_read ? 'ring-1 ring-red-500/40' : ''} ${msg.pinned ? 'ring-1 ring-amber-400/50' : ''}`}
                          title={new Date(msg.created_at).toLocaleString()}
                        >
                          {msg.burn_on_read && (
                            <span className="inline-flex items-center gap-1 text-[8px] font-bold tracking-widest text-red-400/90 uppercase mr-1.5 align-middle">
                              <Flame size={9} /> burn
                            </span>
                          )}
                          {msg.pinned && (
                            <Pin size={9} className="inline rotate-45 text-amber-400 mr-1 align-middle" />
                          )}

                          {msg.text?.startsWith('data:audio/') ? (
                            <audio controls src={msg.text} className="w-full max-w-[220px] h-9" />
                          ) : !isSelf && !animatedMsgs.has(msg.id) && Date.now() - t < 15000 ? (
                            <TypewriterText
                              text={msg.text}
                              speed={10}
                              onComplete={() => setAnimatedMsgs(prev => new Set(prev).add(msg.id))}
                            />
                          ) : (
                            <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                          )}

                          {msg.edited && <span className="ml-1.5 text-[9px] text-zinc-500 italic">edited</span>}

                          {renderFile(msg.file_url)}

                          {/* Instagram heart badge on bubble */}
                          {hearted && (
                            <span className="absolute -bottom-2 -right-1 text-sm drop-shadow-[0_0_6px_rgba(34,211,238,0.5)] bg-[#07070d] rounded-full px-0.5">
                              {HEART}
                            </span>
                          )}

                          {/* Double-tap heart burst */}
                          {heartBurst?.msgId === msg.id && (
                            <span key={heartBurst.key} className="heart-burst pointer-events-none absolute inset-0 flex items-center justify-center text-5xl">
                              {HEART}
                            </span>
                          )}
                        </div>

                        {/* other reactions (non-heart) */}
                        {reactions.filter(r => r.emoji !== HEART).length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1.5 ${isSelf ? 'justify-end' : ''}`}>
                            {Object.entries(
                              reactions
                                .filter(r => r.emoji !== HEART)
                                .reduce((acc: Record<string, number>, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc; }, {})
                            ).map(([emoji, count]) => (
                              <button
                                key={emoji}
                                onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); }}
                                className="flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 bg-white/[0.05] border border-white/10 rounded-full hover:border-cyan-400/40 transition-colors"
                              >
                                <span>{emoji}</span>
                                {count > 1 && <span className="text-[9px] text-zinc-500">{count}</span>}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* seen / meta line under my last message */}
                        {isSelf && lastOwnMsg?.id === msg.id && (
                          <div className={`text-[10px] mt-1 ${isSelf ? 'text-right' : ''} ${ownSeen ? 'text-cyan-400' : 'text-zinc-600'}`}>
                            {ownSeen ? 'Seen' : 'Sent'} · {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </div>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}

              {/* typing bubble (Instagram-style three dots) */}
              {Object.keys(typingUsers).length > 0 && (
                <div className="flex items-end gap-2 mt-2.5">
                  <Avatar seed="typing" name={Object.values(typingUsers)[0] || '?'} size={28} />
                  <div className="bubble-theirs px-4 py-3 flex items-center gap-1">
                    <span className="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    <span className="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    <span className="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-400" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* jump-to-latest chip */}
        {newBelowCount > 0 && !chatLocked && (
          <button
            onClick={jumpToLatest}
            className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 bg-[#0a1220]/95 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold tracking-widest uppercase pl-3 pr-2.5 py-1.5 rounded-full shadow-[0_0_24px_-8px_rgba(34,211,238,0.7)] hover:border-cyan-400 hover:text-white transition-colors"
          >
            <ChevronDown size={12} /> {newBelowCount} NEW
          </button>
        )}
      </div>

      {/* ------------------------- Composer ------------------------- */}
      {chatLocked ? (
        <div className="px-4 py-3 border-t border-white/[0.06] text-center text-[10px] tracking-widest uppercase text-zinc-600 shrink-0">
          Unlock this chat to send messages
        </div>
      ) : (
        <footer className="shrink-0 border-t border-white/[0.06] bg-[#07070d]/80">
          {replyToId && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-cyan-500/[0.04] border-b border-cyan-500/10 text-xs">
              <Reply size={12} className="text-cyan-400 shrink-0" />
              <span className="text-zinc-400 truncate flex-1">
                {messages.find(m => m.id === replyToId)?.text?.slice(0, 60) || 'Attachment'}
              </span>
              <button type="button" onClick={() => setReplyToId(null)} className="text-zinc-500 hover:text-white"><X size={12} /></button>
            </div>
          )}
          {selectedFile && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500/[0.04] border-b border-emerald-500/10 text-xs">
              <Paperclip size={12} className="text-emerald-400 shrink-0" />
              <span className="text-zinc-400 truncate flex-1">{selectedFile.name}</span>
              <button type="button" onClick={() => setSelectedFile(null)} className="text-zinc-500 hover:text-white"><X size={12} /></button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2.5">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]); }}
            />
            {settings.allowFiles && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach file"
                className="p-2 text-zinc-400 hover:text-cyan-300 transition-colors shrink-0"
              >
                <Paperclip className="w-5 h-5" />
              </button>
            )}

            <div className="flex-1 min-w-0 flex items-center bg-white/[0.05] border border-white/[0.07] focus-within:border-cyan-400/50 rounded-full px-4 transition-colors">
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Message…"
                className="axon-caret flex-1 min-w-0 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600 py-2.5"
                aria-label="Message"
              />
              <button
                type="button"
                onClick={() => setBurnNext(v => !v)}
                title={burnNext ? 'Burn-on-read ON for next message' : 'Send next message with burn-on-read'}
                className={`p-1 shrink-0 transition-colors ${burnNext ? 'text-red-400' : 'text-zinc-600 hover:text-red-400'}`}
              >
                <Flame className={`w-4 h-4 ${burnNext ? 'drop-shadow-[0_0_6px_rgba(239,68,68,0.7)]' : ''}`} />
              </button>
            </div>

            {settings.allowVoice && (
              <VoiceRecorder
                onRecordingComplete={(base64Audio) => {
                  if (base64Audio) sendMessage(base64Audio, null, replyToId);
                }}
              />
            )}

            <button
              type="submit"
              disabled={!input.trim() && !selectedFile}
              title="Send"
              className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 text-black flex items-center justify-center shrink-0 transition-all hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed glow-cyan"
            >
              <SendHorizontal className="w-4 h-4" />
            </button>
          </form>
        </footer>
      )}

      {/* ------------------- message context menu ------------------- */}
      {contextMenu && (
        <div
          data-ctx-menu
          className="fixed z-[150] bg-[#0a0f18] border border-white/10 shadow-2xl min-w-[190px] py-1 rounded-xl overflow-hidden"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 210),
            top: Math.min(contextMenu.y, window.innerHeight - 300),
          }}
          onClick={e => e.stopPropagation()}
        >
          {(() => {
            const msg = messages.find(m => m.id === contextMenu.msgId);
            if (!msg) return null;
            const isSelf = msg.sender_id === deviceId;
            return (
              <>
                <MenuRow icon={<Reply size={13} />} label="Reply" onClick={() => { setReplyToId(msg.id); setContextMenu(null); }} />
                <MenuRow icon={<Smile size={13} />} label="React" onClick={() => { setReactionPickerMsgId(msg.id); setContextMenu(null); }} />
                <MenuRow icon={<Pin size={13} />} label={msg.pinned ? 'Unpin' : 'Pin'} onClick={() => { togglePinMessage(msg.id); setContextMenu(null); }} />
                <MenuRow icon={<Clipboard size={13} />} label="Copy text" onClick={() => { navigator.clipboard.writeText(msg.text || ''); setContextMenu(null); }} />
                {isSelf && (
                  <MenuRow icon={<Edit2 size={13} />} label="Edit" onClick={() => { setEditingMsgId(msg.id); setEditingText(msg.text); setContextMenu(null); }} />
                )}
                {isSelf && (
                  <MenuRow icon={<RotateCcw size={13} />} label="Resend" onClick={() => { resendMessage(msg.id); setContextMenu(null); }} />
                )}
                {isSelf && (
                  <>
                    <div className="border-t border-white/5 my-1" />
                    <MenuRow icon={<Trash2 size={13} />} label="Delete" danger onClick={() => { if (confirm('Incinerate this payload?')) deleteMessageLocally(msg.id); setContextMenu(null); }} />
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* inline edit bar */}
      {editingMsgId && (
        <div className="fixed inset-x-0 bottom-0 z-[140] px-4 py-3 bg-[#0a0f18]/95 border-t border-cyan-500/30 flex items-center gap-2">
          <span className="text-[10px] tracking-widest uppercase text-cyan-400 shrink-0">Edit</span>
          <input
            type="text"
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editingText.trim()) {
                editMessage(editingMsgId, editingText.trim());
                setEditingMsgId(null);
                setEditingText('');
              } else if (e.key === 'Escape') {
                setEditingMsgId(null);
                setEditingText('');
              }
            }}
            className="flex-1 bg-black/40 border border-cyan-500/30 text-cyan-100 text-sm px-3 py-2 rounded-lg outline-none focus:border-cyan-400"
            autoFocus
          />
          <button
            onClick={() => { if (editingText.trim()) editMessage(editingMsgId, editingText.trim()); setEditingMsgId(null); setEditingText(''); }}
            className="text-cyan-300 text-xs font-bold tracking-widest uppercase px-2"
          >
            Save
          </button>
          <button onClick={() => { setEditingMsgId(null); setEditingText(''); }} className="text-zinc-500 hover:text-white text-xs uppercase px-2">Esc</button>
        </div>
      )}
    </section>
  );

  function isTypingHere() {
    return Object.keys(typingUsers).length > 0;
  }
};

const MenuRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
}> = ({ icon, label, onClick, danger, trailing }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-left transition-colors ${
      danger ? 'text-red-400/90 hover:bg-red-500/[0.08] hover:text-red-300' : 'text-zinc-300 hover:bg-white/[0.05] hover:text-cyan-300'
    }`}
  >
    {icon}
    <span className="flex-1">{label}</span>
    {trailing}
  </button>
);

export default ConversationPanel;

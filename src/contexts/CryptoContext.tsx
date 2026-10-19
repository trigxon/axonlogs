import { createContext, useContext, useState, useEffect, type ReactNode, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import CryptoJS from 'crypto-js';
import { getMyAvatar, setMyAvatar } from '../utils/chatMeta';
import { isPrivacyLocked } from '../utils/chatLockCore';
import {
  resolveChatKey,
  generateConversationKey,
  wrapConversationKey,
  encryptBytes,
  getActivePrivateCryptoKey,
  getActivePrivateJwk,
  setActivePrivateKey,
  invalidateChatKey,
  clearKeyCache,
} from '../utils/chatCrypto';
import {
  type AxonSession,
  type Account,
  getStoredSession,
  setStoredSession,
  clearStoredSession,
  searchAccounts as authSearchAccounts,
  dmChatName,
  generateDmPasscode,
  sendDmInvite,
  fetchMyDmInvites,
  touchLastSeen,
  isBlockedEitherWay,
  fetchFollowState,
  fetchFollowing,
  insertChatParticipants,
  joinChatByCode,
  logoutAccount,
} from '../utils/auth';
import {
  queueForRetry,
  removeFromOutbox,
  readOutbox,
  outboxForChat,
  classifyFlushError,
} from '../utils/outbox';

/**
 * Phase 5 / S3: resolve the message passphrase for a conversation.
 * E2EE DMs (chat_keys rows, scheme 'ecdh-p256') unwrap the true
 * conversation key on-device; everything else falls back to the
 * legacy share_code model. Memoised per chat for the session.
 */
const chatKeyOf = async (
  supabase: any,
  chat: { id: string; share_code: string },
  username: string,
  online: boolean
): Promise<string> =>
  online && supabase ? resolveChatKey(supabase, chat, username || '') : chat.share_code;

export interface Chat {
  id: string;
  name: string;
  share_code: string;
  created_at: string;
}

export interface Reaction {
  emoji: string;
  user_id: string;
}

/** Lightweight call target (structural subset of Chat) */
export interface CallTarget {
  id: string;
  name: string;
}

/** An incoming call announced over the room's realtime channel */
export interface IncomingCall {
  chatId: string;
  chatName: string;
  callId: string;
  type: 'audio' | 'video';
  fromDeviceId: string;
  fromAlias: string;
}

export type CallStatus = 'idle' | 'ringing' | 'connecting' | 'connected' | 'failed';

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  file_url: string | null;
  burn_on_read: boolean;
  reply_to_id?: string | null;
  read_by?: string[];
  reactions?: Reaction[];
  pinned?: boolean;
  edited?: boolean;
  unsent?: boolean;
  /** Phase D idempotency key — stable across retries; unique per (chat_id, client_tag) */
  client_tag?: string | null;
  /** Phase D delivery lifecycle: pending (in flight) → sent (server ack) → failed (queued). "Seen" derives from read_by. */
  status?: 'pending' | 'sent' | 'failed';
  created_at: string;
  isDecryptionError?: boolean;
}

export interface SystemLog {
  id: string;
  time: string;
  msg: string;
}

export interface AppSettings {
  /** Auto-delete (burn-on-read) master switch */
  burnOnRead: boolean;
  /** Seconds after which burn-on-read payloads auto-destruct */
  burnDelaySeconds: number;
  /** Allow file/photo attachments in transmissions */
  allowFiles: boolean;
  /** Allow voice memo recording in the composer */
  allowVoice: boolean;
  /** Obfuscate the terminal feed while the tab is hidden */
  stealthMode: boolean;
  /** Instagram read receipts: share 'Seen' with the other side */
  readReceipts: boolean;
  /** Share my activity status (Active now / Xm ago) with others */
  showActivity: boolean;
  /** Private account: follow requests need approval */
  privateAccount: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  burnOnRead: true,
  burnDelaySeconds: 10,
  allowFiles: true,
  allowVoice: true,
  stealthMode: false,
  readReceipts: true,
  showActivity: true,
  privateAccount: false,
};

export const BURN_DELAY_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: '10S' },
  { value: 30, label: '30S' },
  { value: 60, label: '1M' },
  { value: 300, label: '5M' },
  { value: 3600, label: '1H' },
];

interface CryptoContextType {
  deviceId: string;
  alias: string;
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  /** Phase D keyset pagination over message history */
  hasMoreMessages: boolean;
  /** Bump to force a fresh fetch of the active conversation's messages. */
  messagesReloadKey: number;
  bumpMessagesReload: () => void;
  /** Chat Lock (Phase 4): drop a conversation's messages from memory now. */
  scrubConversation: (chatId: string) => void;
  loadingOlder: boolean;
  loadOlderMessages: () => Promise<void>;
  latency: number;
  setActiveChat: (chat: Chat) => void;
  createChat: (customName?: string, customCode?: string, isEphemeral?: boolean) => Promise<boolean>;
  joinChat: (code: string) => Promise<boolean>;
  sendMessage: (text: string, file?: File | null, replyToId?: string | null, burnOverride?: boolean, chatOverride?: Chat) => Promise<void>;
  editMessage: (msgId: string, newText: string) => void;
  toggleReaction: (msgId: string, emoji: string) => void;
  togglePinMessage: (msgId: string) => void;
  markAsRead: (msgId: string) => void;
  resendMessage: (msgId: string) => Promise<void>;
  purgeTerminal: () => void;
  addSystemMessage: (text: string) => void;
  deleteMessageLocally: (id: string) => void;
  renameChat: (id: string, newName: string) => Promise<void>;
  archiveChat: (id: string) => void;
  restoreChat: (id: string) => void;
  // Phase 6: group member management
  fetchGroupMembers: (chatId: string) => Promise<{ username: string; added_at: string }[]>;
  addGroupMember: (chatId: string, username: string) => Promise<{ ok: boolean; error?: string }>;
  removeGroupMember: (chatId: string, username: string) => Promise<{ ok: boolean; error?: string }>;
  leaveGroup: (chatId: string) => Promise<boolean>;
  archivedChats: Chat[];
  deleteChat: (id: string) => Promise<void>;
  changeChatPassword: (id: string, newCode: string) => Promise<boolean>;
  updateAlias: (newAlias: string) => void;
  systemLogs: SystemLog[];
  addLog: (msg: string) => void;
  clearLogs: () => void;
  networkStatus: string;
  backendMode: 'online' | 'local';
  pushLocalToCloud: () => Promise<number>;
  onlineUsers: Record<string, string>;
  typingUsers: Record<string, string>;
  broadcastTyping: (isTyping: boolean) => void;
  simBotActive: boolean;
  toggleSimBot: (on?: boolean) => void;
  unlockedChatId: string | null;
  unlockChat: (chatId: string, code: string) => boolean;
  lockChat: (chatId: string) => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  // Calling state
  callingChat: CallTarget | null;
  callType: 'audio' | 'video' | null;
  callStatus: CallStatus;
  callNotice: string | null;
  incomingCall: IncomingCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (chat: Chat, type: 'audio' | 'video') => void;
  endCall: () => void;
  acceptIncomingCall: () => void;
  rejectIncomingCall: () => void;
  getCallRtt: () => Promise<number | null>;
  messagesInView: string[];
  setMessagesInView: (ids: string[]) => void;
  /** gradient for MY avatar (profile picker) */
  myGradient: string;
  updateMyGradient: (gradient: string) => void;
  /** Instagram-style account session (username + password accounts) */
  account: AxonSession | null;
  loginWithAccount: (session: AxonSession) => void;
  logout: () => void;
  /** Find accounts by username (cloud directory search) */
  searchAccounts: (query: string) => Promise<Account[]>;
  /** Instagram "Message @user" flow: create (or open) an encrypted DM and invite the recipient */
  startDmWithUser: (username: string) => Promise<{ ok: boolean; chat?: Chat; error?: string }>;
  /** Instagram group DM: named encrypted channel + one invite per member */
  createGroupChat: (name: string, memberUsernames: string[]) => Promise<{ ok: boolean; chat?: Chat; error?: string }>;
  /** "Unsend" — remove a message for everyone (tombstone via realtime) */
  unsendMessage: (msgId: string) => void;
  /** Forward a message's content into another encrypted channel */
  forwardMessage: (msg: Message, targetChat: Chat) => Promise<void>;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
const isOnline = !!supabase;

/* ------------------------------------------------------------------ */
/* Local-mode persistence + crypto helpers (used when Supabase is off) */
/* ------------------------------------------------------------------ */

const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJSON = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / unavailable */
  }
};

const aesEncrypt = (raw: string, key: string) => (raw ? CryptoJS.AES.encrypt(raw, key).toString() : '');

const aesDecrypt = (encrypted: string, key: string) => {
  if (!encrypted) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, key);
    return bytes.toString(CryptoJS.enc.Utf8) || '';
  } catch {
    return '';
  }
};

const toDisplayMessage = (msg: Message, key: string): Message => {
  const decryptedText = msg.text ? aesDecrypt(msg.text, key) : '';
  const decryptedFileUrl = msg.file_url ? aesDecrypt(msg.file_url, key) : null;
  const hasTextError = msg.text ? !decryptedText : false;
  const hasFileError = msg.file_url ? !decryptedFileUrl : false;
  return {
    ...msg,
    text: hasTextError ? '[DECRYPTION FAILED - INVALID KEY]' : decryptedText,
    file_url: hasFileError ? null : decryptedFileUrl,
    isDecryptionError: hasTextError || hasFileError,
    read_by: msg.read_by || [],
  };
};

// Easy, human-rememberable channel passcode (AXON-XXXX, digits only). The
// passcode is never rendered in the UI — it lives in the device keyring
// (localStorage 'axon_device_keys', findable via DevTools > Application >
// Local Storage) and on each row's data-code attribute in the DOM.
const generateCode = () => `AXON-${Math.floor(1000 + Math.random() * 9000)}`;

/** Phase D: page size for keyset-paginated message history */
const MESSAGE_PAGE_SIZE = 30;

/* Simulated remote node (local sandbox mode only). Gives the offline preview a
 * second node so incoming transmissions, typing indicators, alerts and
 * burn-on-read auto-destruct can all be demonstrated without Supabase. */
const SIM_BOT_ID = 'SIM-47F2';
const SIM_BOT_ALIAS = 'SIM_NODE';
const SIM_POOL = [
  '[SIM_NODE] Handshake confirmed. Channel encryption verified.',
  '[SIM_NODE] Sweep complete. No anomalies detected on this frequency.',
  '[SIM_NODE] Relaying satellite packet... checksum OK.',
  '[SIM_NODE] Standby for next scheduled relay in T-minus 15.',
  '[SIM_NODE] Intrusion attempt logged on port 443 - blocked.',
  '[SIM_NODE] Burn notice: old keys rotated. Refresh your registry.',
  '[SIM_NODE] Beacon received. You are the only active node besides me.',
  '[SIM_NODE] Traffic analysis shows 3 hits on the decoy honeypot.',
];

const makeLocalChat = (
  customName: string | undefined,
  customCode: string | undefined,
  isEphemeral: boolean | undefined,
  consoleIndex: number,
): Chat => {
  let shareCode = (customCode || generateCode()).toUpperCase();
  if (isEphemeral && !shareCode.startsWith('EPH-')) {
    shareCode = `EPH-${shareCode}`;
  }
  return {
    id: crypto.randomUUID(),
    name: (customName || `CONSOLE_${consoleIndex}`).trim().toUpperCase(),
    share_code: shareCode,
    created_at: new Date().toISOString(),
  };
};

/* Per-device keyring: remembers the passphrase for channels created/joined on this
 * device so a refresh-lock never locks you out (the passphrase is still typed each session). */
const saveDeviceKey = (chatId: string, code: string) => {
  const map = readJSON<Record<string, string>>('axon_device_keys', {});
  map[chatId] = code;
  writeJSON('axon_device_keys', map);
};

const readFileAsDataUrl = (file: File): Promise<string | null> =>
  new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

/* Converts a file to a data URL, downscaling large photos so the encrypted
 * payload stays light (works for both cloud fallback and local storage). */
const fileToDataUrl = (file: File): Promise<string | null> =>
  new Promise(resolve => {
    if (!file.type.startsWith('image/')) {
      readFileAsDataUrl(file).then(resolve);
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX_DIM = 1600;
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      if (scale >= 1) {
        URL.revokeObjectURL(objectUrl);
        readFileAsDataUrl(file).then(resolve);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(objectUrl);
      if (!ctx) {
        readFileAsDataUrl(file).then(resolve);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      readFileAsDataUrl(file).then(resolve);
    };
    img.src = objectUrl;
  });

export const CryptoProvider = ({ children }: { children: ReactNode }) => {
  // Instagram-style account session (survives refresh via localStorage)
  const [account, setAccount] = useState<AxonSession | null>(() => getStoredSession());
  const [myGradient, setMyGradient] = useState<string>(() => getMyAvatar(localStorage.getItem('axon_deviceId') || ''));
  const updateMyGradient = useCallback((gradient: string) => {
    setMyAvatar(gradient);
    setMyGradient(gradient);
  }, []);
  const [deviceId, setDeviceId] = useState<string>('');
  const [alias, setAlias] = useState<string>('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [archivedChats, setArchivedChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // Phase D: history pagination + delivery state
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  // Chat Lock (Phase 4): bumping forces a fresh fetch after an unlock.
  const [messagesReloadKey, setMessagesReloadKey] = useState(0);
  const bumpMessagesReload = useCallback(() => setMessagesReloadKey(k => k + 1), []);
  // Chat Lock (Phase 4): purge a conversation's decrypted messages from
  // component memory the moment its lock engages.
  const scrubConversation = useCallback((chatId: string) => {
    setMessages(prev => prev.filter(m => m.chat_id !== chatId));
  }, []);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const oldestCursorRef = useRef<string | null>(null);
  const [latency, setLatency] = useState(0);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [networkStatus, setNetworkStatus] = useState<string>('CONNECTING...');
  const [onlineUsers, setOnlineUsers] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [presenceChannel, setPresenceChannel] = useState<any>(null);
  const [simBotActive, setSimBotActive] = useState(() => localStorage.getItem('axon_sim_active') === 'true');
  // Starts ONLINE when credentials are present; degrades to 'local' if the backend is unreachable/misconfigured
  const [backendMode, setBackendMode] = useState<'online' | 'local'>(isOnline ? 'online' : 'local');
  // Which chat is currently decrypted in this session. NOT persisted -> every refresh re-locks.
  const [unlockedChatId, setUnlockedChatId] = useState<string | null>(null);
  const migrationStartedRef = useRef(false);

  const destructTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Persisted behavior settings (burn timer, attachments, voice, stealth).
  const [settings, setSettings] = useState<AppSettings>(() => {
    const stored = readJSON<Partial<AppSettings>>('axon_app_settings', {});
    return { ...DEFAULT_APP_SETTINGS, ...stored };
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      writeJSON('axon_app_settings', next);
      return next;
    });
  }, []);

  const addLog = useCallback((msg: string) => {
    const id = crypto.randomUUID();
    const time = new Date().toISOString();
    setSystemLogs(prev => {
      const next = [{ id, time, msg }, ...prev];
      writeJSON('axon_logs', next);
      return next;
    });
  }, []);

  const clearLogs = useCallback(() => {
    setSystemLogs([]);
  }, []);

  // Arms the burn-on-read auto-destruct for a payload (local mode only).
  // The delay is user-configurable from Settings (default 10s).
  const scheduleDestruct = useCallback((m: Message) => {
    if (!settingsRef.current.burnOnRead || !m.burn_on_read || m.sender_id === 'SYSTEM') return;
    const delay = Math.max(settingsRef.current.burnDelaySeconds, 1) * 1000;
    const timer = setTimeout(() => {
      setMessages(prev => prev.filter(x => x.id !== m.id));
      writeJSON('axon_messages', readJSON<Message[]>('axon_messages', []).filter(x => x.id !== m.id));
      addLog(`[BURN: Payload destroyed after ${settingsRef.current.burnDelaySeconds}s timer (${m.id.slice(0, 6)}...)]`);
    }, delay);
    destructTimersRef.current.push(timer);
  }, [addLog]);

  // Arms a timed cloud-wide destruct for another node's burn-on-read payload
  // (online mode). Not tracked in destructTimersRef so the burn survives
  // navigation, matching the configured auto-delete window.
  const scheduleCloudDestruct = useCallback((m: Message) => {
    if (!supabase || !settingsRef.current.burnOnRead) return;
    const delay = Math.max(settingsRef.current.burnDelaySeconds, 1) * 1000;
    setTimeout(() => {
      supabase!.from('messages').delete().eq('id', m.id).then(() => {
        setMessages(prev => prev.filter(x => x.id !== m.id));
      });
      addLog(`[BURN: Payload destroyed after ${settingsRef.current.burnDelaySeconds}s timer (${m.id.slice(0, 6)}...)]`);
    }, delay);
  }, [addLog]);

  // Initialize identity
  useEffect(() => {
    let storedId = localStorage.getItem('axon_deviceId');
    let storedAlias = localStorage.getItem('axon_alias');

    if (!storedId) {
      storedId = crypto.randomUUID();
      localStorage.setItem('axon_deviceId', storedId);
    }
    if (!storedAlias) {
      storedAlias = `NODE_${storedId.substring(0, 4).toUpperCase()}`;
      localStorage.setItem('axon_alias', storedAlias);
    }

    // Signed-in accounts own the handle: alias follows the @username.
    const session = getStoredSession();
    if (session?.username) {
      storedAlias = `@${session.username.toLowerCase()}`;
      localStorage.setItem('axon_alias', storedAlias);
      // The username IS the cloud identity: every signed-in message must
      // carry sender_id = my_username() (server-enforced), read receipts
      // and presence key off this id too. A stale local UUID would make
      // every send hit 42501 and land forever in the outbox.
      const uname = session.username.toLowerCase();
      if (storedId !== uname) {
        storedId = uname;
        localStorage.setItem('axon_deviceId', storedId);
      }
    }

    setDeviceId(storedId);
    setAlias(storedAlias);
    setMyGradient(getMyAvatar(storedId));
    addLog(`Identity initialized: ${storedId.substring(0, 8)}...`);
    setNetworkStatus(isOnline ? 'ONLINE' : 'LOCAL');
  }, [addLog]);

  /* ----------------- account session / DM delivery ----------------- */

  const loginWithAccount = useCallback((session: AxonSession) => {
    setStoredSession(session);
    setAccount(session);
    const uname = session.username.toLowerCase();
    const handle = `@${uname}`;
    setAlias(handle);
    localStorage.setItem('axon_alias', handle);
    // The username IS the cloud identity (sender_id = my_username() is
    // server-enforced) — re-point the device id when the session starts
    // mid-session (login without a page reload) or after a legacy UUID.
    setDeviceId(uname);
    localStorage.setItem('axon_deviceId', uname);
    setMyGradient(getMyAvatar(uname));
    addLog(`Account session started: @${session.username}`);
  }, [addLog]);

  const logout = useCallback(() => {
    clearStoredSession();
    setAccount(null);
    // End the Supabase Auth session too (best-effort on v1 setups)
    void logoutAccount(supabase);
    // Phase 5 hygiene: drop all in-memory key material for the session.
    clearKeyCache();
    void setActivePrivateKey(null);
    addLog('Account logged out');
  }, [addLog]);

  // Phase 5 / S3: session restore — silently re-open the device-held private
  // key (IndexedDB, non-extractable device key) so E2EE DMs keep working
  // after a refresh without ever storing the password.
  useEffect(() => {
    const u = account?.username;
    if (!u || backendMode !== 'online') return;
    let cancelled = false;
    (async () => {
      const { trySilentUnlock } = await import('../utils/keyringService');
      if (cancelled) return;
      const res = await trySilentUnlock(u);
      if (res.status === 'ready' && 'created' in res && res.created) {
        addLog('Encryption keyring ready — direct messages are end-to-end encrypted');
      }
    })();
    return () => { cancelled = true; };
  }, [account?.username, backendMode, addLog]);

  // Instagram-style activity status: keep last_seen_at fresh while signed in
  useEffect(() => {
    const u = account?.username;
    if (!u || backendMode !== 'online' || !supabase) return;
    touchLastSeen(supabase, u);
    const t = setInterval(() => touchLastSeen(supabase!, u), 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [account?.username, backendMode]);

  // Sync privacy toggles (private account / activity visibility) to the cloud
  // profile so OTHER users see them — Instagram account-privacy semantics.
  useEffect(() => {
    const u = account?.username;
    if (!u || backendMode !== 'online' || !supabase) return;
    supabase
      .from('accounts')
      .update({ is_private: settingsRef.current.privateAccount === true, show_activity: settingsRef.current.showActivity !== false })
      .eq('username', u)
      .then();
  }, [account?.username, backendMode, settings.privateAccount, settings.showActivity]);

  /** Quietly admit an invited DM: add to state, keyring it, auto-unlock. */
  const admitDmChat = useCallback((chat: Chat) => {
    saveKnownChat(chat.id);
    saveDeviceKey(chat.id, chat.share_code);
    setChats(prev => (prev.some(c => c.id === chat.id) ? prev : [chat, ...prev]));
    setArchivedChats(prev => prev.filter(c => c.id !== chat.id));
    setUnlockedChatId(prev => (prev === chat.id ? prev : chat.id));
  }, []);

  // Backfill: DM invitations addressed to this account (new device login,
  // offline gap) are admitted silently so the inbox mirrors Instagram DMs.
  useEffect(() => {
    const u = account?.username;
    if (!u || backendMode !== 'online' || !supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const invites = await fetchMyDmInvites(supabase!, u);
        if (cancelled || invites.length === 0) return;
        for (const inv of invites) {
          // Admit UNCONDITIONALLY on every mount: unlockedChatId is in-memory
          // state and resets on reload, so skipping invites whose key is
          // already on this device left invited DMs permanently stuck at the
          // lock gate ("Locked — enter the key") after any page refresh.
          // admitDmChat is idempotent (keyring overwrite + dedupe-safe).
          const { data } = await supabase!.from('chats').select('*').eq('id', inv.chat_id).maybeSingle();
          if (data) {
            admitDmChat(data as Chat);
            if (!readJSON<Record<string, string>>('axon_device_keys', {})[inv.chat_id]) {
              addLog(`DM channel with @${inv.from_username} restored`);
            }
          }
        }
      } catch {
        /* invites are best-effort */
      }
    })();
    return () => { cancelled = true; };
  }, [account?.username, backendMode, admitDmChat, addLog]);

  // Realtime: incoming DM invitations auto-join (Instagram DM delivery)
  useEffect(() => {
    const u = account?.username;
    if (!u || backendMode !== 'online' || !supabase) return;
    const channel = supabase!
      .channel(`dm-invites:${u}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_invites', filter: `to_username=eq.${u}` },
        (payload: any) => {
          const inv = payload.new as { chat_id: string; share_code: string; from_username: string };
          if (!inv?.share_code) return;
          supabase!
            .from('chats')
            .select('*')
            .eq('id', inv.chat_id)
            .maybeSingle()
            .then(({ data }: { data: Chat | null }) => {
              if (data) {
                admitDmChat(data);
                addLog(`New DM from @${inv.from_username}`);
              }
            });
        })
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [account?.username, backendMode, admitDmChat, addLog]);

  const searchAccounts = useCallback(async (query: string): Promise<Account[]> => {
    if (!supabase) return [];
    try {
      return await authSearchAccounts(supabase, query, account?.username || '');
    } catch {
      return [];
    }
  }, [account?.username]);

  const startDmWithUser = useCallback(async (username: string): Promise<{ ok: boolean; chat?: Chat; error?: string }> => {
    const target = username.trim().toLowerCase().replace(/^@/, '');
    if (!account) return { ok: false, error: 'Sign in to send direct messages.' };
    if (backendMode !== 'online' || !supabase) return { ok: false, error: 'DMs need the cloud backend (online mode).' };
    if (!target) return { ok: false, error: 'Enter a username.' };
    if (target === account.username.toLowerCase()) return { ok: false, error: "That's you." };

    const me = account.username.toLowerCase();
    const dmName = dmChatName(me, target);

    // Blocks are enforced like Instagram: neither side can DM the other
    if (await isBlockedEitherWay(supabase, me, target)) {
      return { ok: false, error: "You can't message this account." };
    }

    // FOLLOW GATE: you can only start a chat with someone you follow.
    // (Existing chats keep working — history is never locked away.)
    const follow = await fetchFollowState(supabase, me, target);
    if (!follow.following) {
      return {
        ok: false,
        error: follow.requested
          ? `Your follow request to @${target} hasn't been accepted yet.`
          : `Follow @${target} to message them — chats are only for people you follow.`,
      };
    }

    // Reuse the existing DM channel when we already have it
    const existing = chats.find(c => c.name === dmName) || archivedChats.find(c => c.name === dmName);
    if (existing) {
      admitDmChat(existing);
      return { ok: true, chat: existing };
    }

    // Create the encrypted channel with an invite-delivered passphrase
    const shareCode = generateDmPasscode();
    const { data, error } = await supabase
      .from('chats')
      .insert({ name: dmName, share_code: shareCode })
      .select()
      .single();
    if (error || !data) {
      console.error('DM create error:', error);
      return { ok: false, error: 'Could not create the DM. Is the backend set up?' };
    }

    const invited = await sendDmInvite(supabase, target, data.id, data.share_code, me);
    if (!invited) {
      // Keep the channel (it works once the recipient searches us instead)
      addLog(`DM invite to @${target} failed — channel kept`);
    }

    // ── Phase 5 / S3: end-to-end key establishment ─────────────────────
    // When BOTH sides hold keyrings, a fresh 256-bit conversation key is
    // wrapped for each participant via ECDH and stored in chat_keys. The
    // plaintext key never touches the server; share_code becomes a mere
    // lookup code. Without two keyrings the legacy model applies.
    try {
      const myPriv = getActivePrivateCryptoKey();
      const myPub = getActivePrivateJwk();
      const { data: peerKeyRow } = await supabase
        .from('account_keys')
        .select('public_jwk')
        .eq('username', target)
        .maybeSingle();
      if (myPriv && myPub && peerKeyRow?.public_jwk) {
        const convKey = generateConversationKey();
        const wrappedMe = await wrapConversationKey(convKey, myPriv, myPub, data.id);
        const wrappedPeer = await wrapConversationKey(convKey, myPriv, peerKeyRow.public_jwk, data.id);
        await supabase.from('chat_keys').insert([
          { chat_id: data.id, username: me, wrap_scheme: 'ecdh-p256', wrapped_key: wrappedMe, wrap_info: { peer: me } },
          { chat_id: data.id, username: target, wrap_scheme: 'ecdh-p256', wrapped_key: wrappedPeer, wrap_info: { peer: me } },
        ]);
        addLog(`End-to-end encrypted channel to @${target} — keys wrapped on-device`);
      } else {
        addLog(`@${target} has no encryption keyring yet — channel uses the legacy key model`);
      }
    } catch (e2eeErr) {
      console.warn('E2EE key establishment failed; legacy model applies', e2eeErr);
      addLog(`Key setup hiccup — channel falls back to the legacy key model`);
    }

    // Member-scoped RLS (schema v2) admits both sides via membership rows
    await insertChatParticipants(supabase, data.id, [me, target]);

    admitDmChat(data as Chat);
    setActiveChat(data as Chat);
    addLog(`Direct message to @${target} started`);
    return { ok: true, chat: data as Chat };
  }, [account, backendMode, chats, archivedChats, admitDmChat, addLog]);

  // NOTE: no chat is auto-selected or auto-created on entry — the app always
  // opens on STANDBY. The user must explicitly CREATE a terminal; clicking one
  // is the only thing that loads its data and demands the passcode.

  const unlockChat = useCallback((chatId: string, code: string): boolean => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat || chat.share_code !== code.trim().toUpperCase()) return false;
    setUnlockedChatId(chatId);
    saveDeviceKey(chatId, chat.share_code);
    addLog(`Terminal ${chat.name} decrypted (session unlocked)`);
    return true;
  }, [chats, addLog]);

  const lockChat = useCallback((chatId: string) => {
    setUnlockedChatId(prev => (prev === chatId ? null : prev));
    setMessages(prev => prev.filter(m => m.chat_id !== chatId));
    const chat = chats.find(c => c.id === chatId);
    addLog(`Terminal ${chat?.name || 'UNKNOWN'} locked`);
  }, [chats, addLog]);

  // Fetch chats on init + keep the global terminal list live-synced across devices
  useEffect(() => {
    if (!deviceId) return;

    if (backendMode === 'online') {
      if (!supabase) {
        setBackendMode('local');
        setNetworkStatus('LOCAL');
        return;
      }

      // GLOBAL SYNC: any terminal created/renamed/wiped on ANY device
      // appears/disappears here in real time.
      const chatsChannel = supabase!.channel('global-chats')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload) => {
          const nc = payload.new as Chat;
          const isArchived = getArchivedIds().includes(nc.id);
          if (isArchived) {
            setArchivedChats(prev => (prev.some(c => c.id === nc.id) ? prev : [nc, ...prev]));
          } else {
            setChats(prev => (prev.some(c => c.id === nc.id) ? prev : [nc, ...prev]));
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, (payload) => {
          const uc = payload.new as Chat;
          setChats(prev => prev.map(c => (c.id === uc.id ? uc : c)));
          setArchivedChats(prev => prev.map(c => (c.id === uc.id ? uc : c)));
          setActiveChat(prev => (prev?.id === uc.id ? uc : prev));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chats' }, (payload) => {
          const oldId = (payload.old as any)?.id;
          setChats(prev => prev.filter(c => c.id !== oldId));
          setArchivedChats(prev => prev.filter(c => c.id !== oldId));
        })
        .subscribe();

      const fetchChats = async () => {
        try {
          // GLOBAL: pull EVERY terminal from the cloud - not just the ones this
          // device already knows about - so chats show up on all devices.
          const { data, error } = await supabase!
            .from('chats')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) throw error;

          if (data && data.length > 0) {
            // Partition into active vs archived (per-device archive preference)
            const archivedIds = getArchivedIds();
            const active = data.filter((c: any) => !archivedIds.includes(c.id));
            const archived = data.filter((c: any) => archivedIds.includes(c.id));
            setChats(active);
            setArchivedChats(archived);
            // LAZY LOAD: stay on STANDBY until the user clicks a terminal.
            // The only exception is an explicit ?room=CODE deep link.
            const roomParam = new URLSearchParams(window.location.search).get('room');
            if (roomParam) {
              const target = active.find((c: any) => c.share_code === roomParam.trim().toUpperCase());
              setActiveChat(target || null);
            } else {
              setActiveChat(null);
            }
          }
          // NOTE: if no terminals exist anywhere, we stay on STANDBY with an
          // empty list — the user creates their first one explicitly.
          void migrateLocalToCloud();
        } catch (e: any) {
          // Backend missing/unreachable -> degrade to the local sandbox instead of alerting
          console.error("Supabase unavailable, degrading to local mode:", e?.message || e);
          setBackendMode('local');
          setNetworkStatus('LOCAL');
          addLog('Supabase backend unavailable - degraded to LOCAL MODE');
        }
      };

      fetchChats();

      return () => {
        supabase!.removeChannel(chatsChannel);
      };
    } else {
      // LOCAL / DEGRADED MODE: channels are persisted locally and work fully offline
      const localChats = readJSON<Chat[]>('axon_chats', []);
      setArchivedChats(readJSON<Chat[]>('axon_archived_chats_data', []));
      // NOTE: never auto-create a terminal — stay on STANDBY until the user
      // creates one or clicks an existing one (or uses ?room=CODE).
      setChats(localChats);
      const roomParam = new URLSearchParams(window.location.search).get('room');
      if (roomParam) {
        const target = localChats.find(c => c.share_code === roomParam.trim().toUpperCase());
        setActiveChat(target || null);
      } else {
        setActiveChat(null);
      }
    }
  }, [deviceId, backendMode]);

  // Pushes local sandbox data up to the cloud so everything is saved globally.
  // Runs once per session on a healthy online boot; local copies are cleared afterwards.
  const migrateLocalToCloud = async () => {
    if (backendMode !== 'online' || !supabase || migrationStartedRef.current) return;
    const localChats = readJSON<Chat[]>('axon_chats', []);
    if (localChats.length === 0) return;
    migrationStartedRef.current = true;
    const known = JSON.parse(localStorage.getItem('axon_known_chats') || '[]') as string[];
    const localMsgs = readJSON<Message[]>('axon_messages', []);
    let migrated = 0;
    for (const lc of localChats) {
      if (known.includes(lc.id)) continue;
      const { data, error } = await supabase!
        .from('chats')
        .insert({ name: lc.name, share_code: lc.share_code })
        .select()
        .single();
      if (error || !data) {
        console.error('Cloud sync failed for local chat:', error);
        continue;
      }
      known.push(data.id);
      const msgs = localMsgs.filter(m => m.chat_id === lc.id);
      // Member-scoped RLS (schema v2): creator needs a membership row
      if (account) await insertChatParticipants(supabase!, data.id, [account.username]);
      for (const m of msgs) {
        await supabase!.from('messages').insert({
          chat_id: data.id,
          sender_id: m.sender_id,
          text: m.text,
          file_url: m.file_url,
          burn_on_read: false,
          reply_to_id: null,
          read_by: m.read_by || [],
          created_at: m.created_at,
        }).then();
      }
      migrated++;
    }
    if (migrated > 0) {
      localStorage.setItem('axon_known_chats', JSON.stringify(known));
      writeJSON('axon_chats', []);
      writeJSON('axon_messages', []);
      addLog(`Pushed ${migrated} local terminal(s) to global cloud storage`);
    }
  };

  // Manual trigger for pushing any locally-stored terminals/messages up to the cloud.
  // Returns how many local terminals were successfully uploaded (0 if already in sync
  // or the cloud backend is unavailable).
  const pushLocalToCloud = useCallback(async (): Promise<number> => {
    if (backendMode !== 'online' || !supabase) return 0;
    migrationStartedRef.current = false; // allow re-run on demand
    const before = readJSON<Chat[]>('axon_chats', []).length;
    await migrateLocalToCloud();
    const after = readJSON<Chat[]>('axon_chats', []).length;
    return before - after;
  }, [backendMode, migrateLocalToCloud]);

  const getArchivedIds = () => readJSON<string[]>('axon_archived_chats', []);

  const saveKnownChat = (chatId: string) => {
    const stored = JSON.parse(localStorage.getItem('axon_known_chats') || '[]');
    if (!stored.includes(chatId)) {
      stored.push(chatId);
      localStorage.setItem('axon_known_chats', JSON.stringify(stored));
    }
  };

  const createChat = async (customName?: string, customCode?: string, isEphemeral?: boolean) => {
    const cleanName = (customName || `CONSOLE_${chats.length + 1}`).trim().toUpperCase();
    if (backendMode === 'online') {
      if (!supabase) return false;
      let shareCode = (customCode || generateCode()).toUpperCase();
      if (isEphemeral && !shareCode.startsWith('EPH-')) {
        shareCode = `EPH-${shareCode}`;
      }
      const newChat = {
        name: cleanName,
        share_code: shareCode,
      };

      const { data, error } = await supabase.from('chats').insert(newChat).select().single();
      if (error) {
        console.error("Create chat error:", error);
        // Backend unavailable (missing tables / RLS / auth / network) -> degrade to local mode
        setBackendMode('local');
        setNetworkStatus('LOCAL');
        addLog('Supabase backend unavailable - degraded to LOCAL MODE');
        // The operator explicitly asked for a tunnel - create it locally so the channel still works
        const chat = makeLocalChat(customName, customCode, isEphemeral, chats.length + 1);
        const next = [chat, ...chats];
        writeJSON('axon_chats', next);
        setChats(next);
        setActiveChat(chat);
        addLog(`Created channel ${chat.name} [${chat.share_code}] (LOCAL MODE)`);
        return true;
      }
      if (data) {
        saveKnownChat(data.id);
        saveDeviceKey(data.id, data.share_code);
        setChats(prev => [data, ...prev]);
        setActiveChat(data);
        addLog(`Created channel ${data.name} [KEY SAVED TO DEVICE KEYRING]`);
        // Member-scoped RLS (schema v2): the creator needs a membership row
        if (account) await insertChatParticipants(supabase, data.id, [account.username]);
        return true;
      }
      return false;
    }

    // LOCAL MODE
    const chat = makeLocalChat(customName, customCode, isEphemeral, chats.length + 1);
    const next = [chat, ...chats];
    writeJSON('axon_chats', next);
    saveDeviceKey(chat.id, chat.share_code);
    setChats(next);
    setActiveChat(chat);
    addLog(`Created channel ${chat.name} [${chat.share_code}] [KEY SAVED TO DEVICE KEYRING]`);
    return true;
  };

  const joinChat = async (code: string) => {
    if (backendMode === 'online') {
      if (!supabase) return false;
      // v2: join via RPC (knowing the code = proof of membership, and the
      // membership row is written server-side). v1: direct lookup.
      let data: any = null;
      const rpc = await joinChatByCode(supabase, code).catch(() => ({ chat: null, rpcMissing: true }));
      if (rpc.rpcMissing) {
        const direct = await supabase.from('chats').select('*').eq('share_code', code).single();
        data = direct.data;
        if (direct.error) {
          console.error('Join chat error:', direct.error);
          // PGRST116 = no matching row (invalid code). Anything else = backend down -> degrade.
          if ((direct.error as any).code !== 'PGRST116') {
            setBackendMode('local');
            setNetworkStatus('LOCAL');
            addLog('Supabase backend unavailable - degraded to LOCAL MODE');
          }
        }
      } else {
        data = rpc.chat;
      }
      if (data) {
        saveKnownChat(data.id);
        saveDeviceKey(data.id, data.share_code);
        setChats(prev => {
          if (!prev.find(c => c.id === data.id)) return [data, ...prev];
          return prev;
        });
        setActiveChat(data);
        return true;
      }
      // No match in the backend - fall through to the local lookup below
    }

    // LOCAL MODE
    const localChats = readJSON<Chat[]>('axon_chats', []);
    const found = localChats.find(c => c.share_code === code.trim().toUpperCase());
    if (found) {
      saveDeviceKey(found.id, found.share_code);
      setActiveChat(found);
      addLog(`Joined channel ${found.name} [${found.share_code}]`);
      return true;
    }
    return false;
  };

  const renameChat = async (id: string, newName: string) => {
    const cleanName = newName.trim().toUpperCase();
    if (backendMode === 'online') {
      if (!supabase) return;
      const { error } = await supabase.from('chats').update({ name: cleanName }).eq('id', id);
      if (error) console.error("Rename chat error:", error);
    }
    setChats(prev => {
      const next = prev.map(c => (c.id === id ? { ...c, name: cleanName } : c));
      if (backendMode !== 'online') writeJSON('axon_chats', next);
      return next;
    });
    if (activeChat?.id === id) {
      setActiveChat(prev => (prev ? { ...prev, name: cleanName } : null));
    }
    addLog(`Renamed terminal to ${cleanName}`);
  };

  const archiveChat = (id: string) => {
    const chat = chats.find(c => c.id === id) || archivedChats.find(c => c.id === id);
    if (!chat) return;
    const ids = getArchivedIds();
    if (!ids.includes(id)) {
      localStorage.setItem('axon_archived_chats', JSON.stringify([...ids, id]));
    }
    setChats(prev => prev.filter(c => c.id !== id));
    setArchivedChats(prev => (prev.some(c => c.id === id) ? prev : [chat, ...prev]));
    if (backendMode !== 'online') {
      writeJSON('axon_chats', readJSON<Chat[]>('axon_chats', []).filter(c => c.id !== id));
      writeJSON('axon_archived_chats_data', [chat, ...readJSON<Chat[]>('axon_archived_chats_data', []).filter(c => c.id !== id)]);
    }
    if (activeChat?.id === id) {
      setActiveChat(chats.find(c => c.id !== id) || null);
    }
    addLog(`Archived terminal ${chat.name} (restorable)`);
  };

  const restoreChat = (id: string) => {
    const chat = archivedChats.find(c => c.id === id);
    if (!chat) return;
    const ids = getArchivedIds().filter(x => x !== id);
    localStorage.setItem('axon_archived_chats', JSON.stringify(ids));
    setArchivedChats(prev => prev.filter(c => c.id !== id));
    setChats(prev => (prev.some(c => c.id === id) ? prev : [chat, ...prev]));
    if (backendMode !== 'online') {
      writeJSON('axon_archived_chats_data', readJSON<Chat[]>('axon_archived_chats_data', []).filter(c => c.id !== id));
      writeJSON('axon_chats', [chat, ...readJSON<Chat[]>('axon_chats', []).filter(c => c.id !== id)]);
    }
    addLog(`Restored terminal ${chat.name}`);
  };

  /* ------------------- Phase 6: group member management ------------------- */

  const fetchGroupMembers = useCallback(async (chatId: string): Promise<{ username: string; added_at: string }[]> => {
    if (backendMode !== 'online' || !supabase) return [];
    const { data } = await supabase
      .from('chat_participants')
      .select('username, added_at')
      .eq('chat_id', chatId)
      .order('added_at', { ascending: true });
    return (data || []) as { username: string; added_at: string }[];
  }, [backendMode, supabase]);

  const addGroupMember = useCallback(async (chatId: string, rawUsername: string): Promise<{ ok: boolean; error?: string }> => {
    if (backendMode !== 'online' || !supabase || !account) return { ok: false, error: 'Groups need the cloud backend.' };
    const uname = rawUsername.trim().toLowerCase().replace(/^@/, '');
    if (!uname) return { ok: false, error: 'Enter a username.' };
    if (uname === account.username.toLowerCase()) return { ok: false, error: "That's you — you're already in." };
    // must be a real account
    const { data: acct } = await supabase.from('accounts').select('username').eq('username', uname).maybeSingle();
    if (!acct) return { ok: false, error: `@${uname} doesn't exist.` };
    if (await isBlockedEitherWay(supabase, account.username.toLowerCase(), uname)) {
      return { ok: false, error: `You can't add @${uname}.` };
    }
    const { data: existing } = await supabase
      .from('chat_participants')
      .select('username')
      .eq('chat_id', chatId)
      .eq('username', uname)
      .maybeSingle();
    if (existing) return { ok: false, error: `@${uname} is already in this group.` };
    const { error } = await supabase.from('chat_participants').insert({ chat_id: chatId, username: uname });
    if (error) return { ok: false, error: error.message || 'Could not add the member.' };
    addLog(`@${uname} added to the group`);
    return { ok: true };
  }, [backendMode, supabase, account, addLog]);

  const removeGroupMember = useCallback(async (chatId: string, username: string): Promise<{ ok: boolean; error?: string }> => {
    if (backendMode !== 'online' || !supabase) return { ok: false, error: 'Groups need the cloud backend.' };
    const { error } = await supabase
      .from('chat_participants')
      .delete()
      .eq('chat_id', chatId)
      .eq('username', username.toLowerCase());
    if (error) return { ok: false, error: error.message || 'Could not remove the member.' };
    addLog(`@${username} removed from the group`);
    return { ok: true };
  }, [backendMode, supabase, addLog]);

  /** TRUE leave: the membership row is deleted (RLS: self-leave). */
  const leaveGroup = useCallback(async (chatId: string): Promise<boolean> => {
    if (backendMode !== 'online' || !supabase || !account) return false;
    const { error } = await supabase
      .from('chat_participants')
      .delete()
      .eq('chat_id', chatId)
      .eq('username', account.username.toLowerCase());
    if (error) {
      addLog(`Could not leave the group (${error.message})`);
      return false;
    }
    setChats(prev => prev.filter(c => c.id !== chatId));
    setArchivedChats(prev => prev.filter(c => c.id !== chatId));
    setMessages(prev => prev.filter(m => m.chat_id !== chatId));
    if (activeChat?.id === chatId) setActiveChat(null);
    invalidateChatKey(chatId);
    addLog('You left the group');
    return true;
  }, [backendMode, supabase, account, activeChat, addLog]);

  const deleteChat = async (id: string) => {
    if (backendMode === 'online') {
      if (!supabase) return;
      const { error } = await supabase.from('chats').delete().eq('id', id);
      if (error) {
        console.error("Delete chat error:", error);
        return;
      }
    } else {
      // LOCAL MODE: wipe channel + its messages everywhere
      writeJSON('axon_chats', readJSON<Chat[]>('axon_chats', []).filter(c => c.id !== id));
      writeJSON('axon_archived_chats_data', readJSON<Chat[]>('axon_archived_chats_data', []).filter(c => c.id !== id));
      writeJSON('axon_messages', readJSON<Message[]>('axon_messages', []).filter(m => m.chat_id !== id));
    }
    // Remove from every device-local list (active, archived, known, keyring)
    const ids = getArchivedIds().filter(x => x !== id);
    localStorage.setItem('axon_archived_chats', JSON.stringify(ids));
    setChats(prev => prev.filter(c => c.id !== id));
    setArchivedChats(prev => prev.filter(c => c.id !== id));
    if (activeChat?.id === id) {
      setActiveChat(chats.find(c => c.id !== id) || null);
    }
    addLog(`Deleted terminal globally`);
  };

  const changeChatPassword = async (id: string, newCode: string) => {
    const cleanCode = newCode.trim().toUpperCase();
    if (backendMode === 'online') {
      if (!supabase) return false;
      const { error } = await supabase.from('chats').update({ share_code: cleanCode }).eq('id', id);
      if (error) {
        console.error("Change password error:", error);
        return false;
      }
    } else {
      const next = chats.map(c => (c.id === id ? { ...c, share_code: cleanCode } : c));
      writeJSON('axon_chats', next);
    }
    setChats(prev => prev.map(c => (c.id === id ? { ...c, share_code: cleanCode } : c)));
    if (activeChat?.id === id) {
      setActiveChat(prev => (prev ? { ...prev, share_code: cleanCode } : null));
    }
    saveDeviceKey(id, cleanCode);
    addLog(`Rotated encryption key for terminal`);
    return true;
  };

  const updateAlias = useCallback((newAlias: string) => {
    const cleanAlias = newAlias.trim().toUpperCase() || `NODE_${deviceId.substring(0, 4)}`;
    setAlias(cleanAlias);
    localStorage.setItem('axon_alias', cleanAlias);
    addLog(`Alias updated to ${cleanAlias}`);
  }, [deviceId, addLog]);

  const decryptText = useCallback((encrypted: string, key: string) => aesDecrypt(encrypted, key), []);

  const encryptText = useCallback((raw: string, key: string) => aesEncrypt(raw, key), []);

  // Fetch messages for active chat
  useEffect(() => {
    if (backendMode === 'online') {
      if (!supabase || !activeChat) return;
      // Chat Lock (Phase 4): a protected conversation that is not unlocked
      // in this tab session loads NOTHING — no fetch, no decrypt, no state.
      if (isPrivacyLocked(activeChat.id)) {
        setMessages([]);
        return;
      }
      if (unlockedChatId !== activeChat.id) {
        setMessages([]);
        return;
      }
      setMessages([]);
      oldestCursorRef.current = null;
      setHasMoreMessages(false);

      const fetchMessages = async () => {
        // Phase D keyset pagination: newest page only — older history loads
        // on demand via loadOlderMessages() instead of unbounded full scans.
        // Phase 5 S3: resolve the conversation key first (E2EE DMs unwrap
        // the wrapped key on-device; legacy chats keep share_code).
        const chatKey = await chatKeyOf(supabase, activeChat, account?.username || '', backendMode === 'online');
        const { data } = await supabase!
          .from('messages')
          .select('*')
          .eq('chat_id', activeChat.id)
          .order('created_at', { ascending: false })
          .limit(MESSAGE_PAGE_SIZE);

        if (data) {
          const page = (data.slice().reverse()) as Message[];
          oldestCursorRef.current = page.length ? page[0].created_at : null;
          setHasMoreMessages(data.length === MESSAGE_PAGE_SIZE);
          const decryptedMsgs = page.map(msg => toDisplayMessage(msg, chatKey));

          // Offline recovery (Phase D): re-attach this chat's queued but
          // undelivered payloads so failed sends survive full page reloads.
          // Queued payloads were encrypted with the SAME resolved key.
          const queued = outboxForChat(activeChat.id).filter(e => !decryptedMsgs.some(m => m.id === e.id));
          const queuedMsgs: Message[] = queued.map(e => ({
            ...toDisplayMessage(e.payload as Message, chatKey),
            client_tag: e.client_tag,
            status: 'failed' as const,
          }));
          setMessages([...decryptedMsgs, ...queuedMsgs]);

          // Process read receipts (honors the Read receipts setting)
          decryptedMsgs.forEach(msg => {
            if (
              settingsRef.current.readReceipts !== false &&
              msg.sender_id !== deviceId && !msg.isDecryptionError && (!msg.read_by || !msg.read_by.includes(deviceId))
            ) {
              const newReadBy = [...(msg.read_by || []), deviceId];
              supabase!.from('messages').update({ read_by: newReadBy }).eq('id', msg.id).then();
            }
          });

          // Burn-on-read: schedule timed cloud-wide destruct for other nodes' payloads
          data.forEach(msg => {
            if (msg.burn_on_read && msg.sender_id !== deviceId) {
              scheduleCloudDestruct(msg);
            }
          });
        }
      };

      fetchMessages();

      // Subscribe to new messages and presence
      const channel = supabase!.channel(`room:${activeChat.id}`, {
        config: { presence: { key: deviceId } },
      });

      channel
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${activeChat.id}`,
        }, async (payload) => {
          // Chat Lock: while the conversation sits behind the lock screen,
          // incoming payloads are never decrypted or stored.
          if (isPrivacyLocked(activeChat.id)) return;
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as any)?.id;
            if (oldId) setMessages(prev => prev.filter(m => m.id !== oldId));
            return;
          }
          const newMsg = payload.new as Message;
          if (newMsg.sender_id !== deviceId) {
            const msgTime = new Date(newMsg.created_at).getTime();
            setLatency(Date.now() - msgTime);
          }

          // Phase 5 S3: resolve the conversation key (cached after first use).
          const chatKey = await chatKeyOf(supabase, activeChat, account?.username || '', backendMode === 'online');
          const decryptedText = newMsg.text ? decryptText(newMsg.text, chatKey) : '';
          const decryptedFileUrl = newMsg.file_url ? decryptText(newMsg.file_url, chatKey) : null;
          const hasTextError = newMsg.text ? !decryptedText : false;
          const hasFileError = newMsg.file_url ? !decryptedFileUrl : false;

          const completeMsg = {
            ...newMsg,
            text: hasTextError ? '[DECRYPTION FAILED - INVALID KEY]' : decryptedText,
            file_url: hasFileError ? null : decryptedFileUrl,
            isDecryptionError: hasTextError || hasFileError,
            read_by: newMsg.read_by || [],
          };

          // If this is an UPDATE event (e.g. read_by array changed), just update the existing message
          if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(m => m.id === completeMsg.id ? completeMsg : m));
            return;
          }

          // Dedupe: the sender already rendered this message optimistically
          setMessages(prev => (prev.some(m => m.id === completeMsg.id) ? prev : [...prev, completeMsg]));

          if (newMsg.sender_id !== deviceId && !hasTextError && !hasFileError && (!newMsg.read_by || !newMsg.read_by.includes(deviceId)) && settingsRef.current.readReceipts !== false) {
            const newReadBy = [...(newMsg.read_by || []), deviceId];
            supabase!.from('messages').update({ read_by: newReadBy }).eq('id', newMsg.id).then();
          }

          if (newMsg.burn_on_read && newMsg.sender_id !== deviceId) {
            scheduleCloudDestruct(newMsg);
          }
        })
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const online: Record<string, string> = {};
          for (const id in state) {
            const presence: any = state[id][0];
            online[id] = presence.alias || id;
          }
          setOnlineUsers(online);
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          setTypingUsers(prev => {
            const next = { ...prev };
            if (payload.isTyping) {
              next[payload.deviceId] = payload.alias;
            } else {
              delete next[payload.deviceId];
            }
            return next;
          });
        })
        .on('broadcast', { event: 'EPH_MSG' }, ({ payload }) => {
          if (isPrivacyLocked(activeChat.id)) return; // Chat Lock gate
          const { sender_id, text, file_url, reply_to_id, id, created_at } = payload;

          const decryptedText = text ? decryptText(text, activeChat.share_code) : '';
          const decryptedFileUrl = file_url ? decryptText(file_url, activeChat.share_code) : null;
          const hasTextError = text ? !decryptedText : false;
          const hasFileError = file_url ? !decryptedFileUrl : false;

          const ephMsg: Message = {
            id,
            chat_id: activeChat.id,
            sender_id,
            text: hasTextError ? '[DECRYPTION FAILED - INVALID KEY]' : decryptedText,
            file_url: hasFileError ? null : decryptedFileUrl,
            burn_on_read: false,
            reply_to_id,
            created_at,
            isDecryptionError: hasTextError || hasFileError,
            read_by: [],
          };

          setMessages(prev => [...prev, ephMsg]);
        })
        .on('broadcast', { event: 'webrtc' }, ({ payload }) => {
          webrtcSignalRef.current?.(payload);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ deviceId, alias, onlineAt: new Date().toISOString() });
          }
        });

      setPresenceChannel(channel);

      return () => {
        supabase!.removeChannel(channel);
        setPresenceChannel(null);
      };
    }

    // LOCAL MODE
    if (!activeChat) {
      setMessages([]);
      return;
    }
    if (isPrivacyLocked(activeChat.id)) {
      setMessages([]);
      return;
    }
    if (unlockedChatId !== activeChat.id) {
      setMessages([]);
      return;
    }

    const all = readJSON<Message[]>('axon_messages', []);
    const display = all.filter(m => m.chat_id === activeChat.id).map(m => toDisplayMessage(m, activeChat.share_code));
    setMessages(display);

    // Clear previous destruct timers, then arm burn-on-read auto-destruct (10s)
    destructTimersRef.current.forEach(t => clearTimeout(t));
    destructTimersRef.current = [];
    display.forEach(m => scheduleDestruct(m));

    return () => {
      destructTimersRef.current.forEach(t => clearTimeout(t));
      destructTimersRef.current = [];
    };
  }, [activeChat, deviceId, alias, decryptText, scheduleDestruct, backendMode, unlockedChatId, messagesReloadKey]);

  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (presenceChannel) {
      presenceChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { deviceId, alias, isTyping },
      });
    }
  }, [presenceChannel, deviceId, alias]);

  const toggleSimBot = useCallback((on?: boolean) => {
    const next = on ?? !simBotActive;
    setSimBotActive(next);
    localStorage.setItem('axon_sim_active', next ? 'true' : 'false');
    addLog(next
      ? 'Simulated remote node ONLINE (local sandbox transmissions active)'
      : 'Simulated remote node OFFLINE');
  }, [simBotActive, addLog]);

  // Local sandbox: simulated remote node transmits into the active channel
  useEffect(() => {
    if (backendMode !== 'local' || !simBotActive || !activeChat) return;
    let alive = true;

    const deliver = (burn: boolean) => {
      const text = SIM_POOL[Math.floor(Math.random() * SIM_POOL.length)];
      const raw: Message = {
        id: crypto.randomUUID(),
        chat_id: activeChat.id,
        sender_id: SIM_BOT_ID,
        text: encryptText(text, activeChat.share_code),
        file_url: null,
        burn_on_read: burn,
        reply_to_id: null,
        read_by: [],
        created_at: new Date().toISOString(),
      };

      // Typing indicator first, then deliver after a short transmit delay
      setTypingUsers(prev => ({ ...prev, [SIM_BOT_ID]: SIM_BOT_ALIAS }));
      setTimeout(() => {
        if (!alive) return;
        setTypingUsers(prev => {
          const next = { ...prev };
          delete next[SIM_BOT_ID];
          return next;
        });
        setMessages(prev => [...prev, toDisplayMessage(raw, activeChat.share_code)]);
        writeJSON('axon_messages', [...readJSON<Message[]>('axon_messages', []), raw]);
        if (burn) scheduleDestruct(raw);
        addLog(`Incoming transmission from ${SIM_BOT_ALIAS}${burn ? ' [BURN-ON-READ]' : ''}`);
      }, 1400);
    };

    const burnEnabled = settingsRef.current.burnOnRead;
    const first = setTimeout(() => deliver(burnEnabled && Math.random() < 0.5), 3000);
    const interval = setInterval(() => deliver(burnEnabled && Math.random() < 0.4), 15000);

    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(interval);
      setTypingUsers(prev => {
        const next = { ...prev };
        delete next[SIM_BOT_ID];
        return next;
      });
    };
  }, [backendMode, simBotActive, activeChat?.id, encryptText, scheduleDestruct, addLog]);

  /* ------------------- Phase D: history pagination + durable outbox ------------------- */

  const loadOlderMessages = useCallback(async () => {
    if (backendMode !== 'online' || !supabase || !activeChat) return;
    if (loadingOlder || !hasMoreMessages || !oldestCursorRef.current) return;
    setLoadingOlder(true);
    try {
      const chatKey = await chatKeyOf(supabase, activeChat, account?.username || '', true);
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', activeChat.id)
        .lt('created_at', oldestCursorRef.current)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      if (data && data.length) {
        const page = (data.slice().reverse()) as Message[];
        oldestCursorRef.current = page[0].created_at;
        setHasMoreMessages(data.length === MESSAGE_PAGE_SIZE);
        const decrypted = page.map(m => toDisplayMessage(m, chatKey));
        setMessages(prev => {
          const existing = new Set(prev.map(m => m.id));
          return [...decrypted.filter(m => !existing.has(m.id)), ...prev];
        });
        // Older history still honors read receipts + burn semantics
        decrypted.forEach(msg => {
          if (
            settingsRef.current.readReceipts !== false &&
            msg.sender_id !== deviceId && !msg.isDecryptionError && !(msg.read_by || []).includes(deviceId)
          ) {
            const newReadBy = [...(msg.read_by || []), deviceId];
            supabase!.from('messages').update({ read_by: newReadBy }).eq('id', msg.id).then();
          }
        });
        page.forEach(raw => {
          if (raw.burn_on_read && raw.sender_id !== deviceId) scheduleCloudDestruct(raw);
        });
      } else {
        setHasMoreMessages(false);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [backendMode, supabase, activeChat, loadingOlder, hasMoreMessages, deviceId]);

  const flushingRef = useRef(false);

  /**
   * Phase D insert with graceful degradation: on a legacy (pre-Phase D) schema
   * the client_tag column does not exist yet → PostgREST answers PGRST204 /
   * 42703. Retry the SAME payload without the tag so sends keep working on
   * both schema generations (dedupe degrades to best-effort until the owner
   * re-runs schema.sql, then idempotency activates automatically).
   */
  const insertMessageSafe = useCallback(async (payload: Record<string, any>) => {
    if (!supabase) return { error: { message: 'no backend', code: 'NO_BACKEND' } as any };
    const first = await supabase.from('messages').insert(payload);
    if (!first.error) return { error: null };
    const code = (first.error as any).code;
    const msg = first.error.message || '';
    if (code === 'PGRST204' || code === '42703' || /client_tag/i.test(msg)) {
      const { client_tag: _omitted, ...rest } = payload;
      const second = await supabase.from('messages').insert(rest);
      return { error: second.error };
    }
    return { error: first.error };
  }, [supabase]);

  const flushOutbox = useCallback(async () => {
    if (backendMode !== 'online' || !supabase || flushingRef.current) return;
    const outbox = readOutbox();
    if (outbox.length === 0) return;
    flushingRef.current = true;
    let delivered = 0, deduped = 0, failed = 0;
    const flushedIds = new Set<string>();
    for (const entry of outbox) {
      try {
        const { error } = await insertMessageSafe({ ...entry.payload, client_tag: entry.client_tag });
        if (!error) {
          delivered++;
          flushedIds.add(entry.id);
          removeFromOutbox(entry.client_tag);
          continue;
        }
        const kind = classifyFlushError((error as any).code, error.message);
        if (kind === 'duplicate') {
          // The first attempt DID land — idempotent success, never a twin.
          deduped++;
          flushedIds.add(entry.id);
          removeFromOutbox(entry.client_tag);
          continue;
        }
        failed++; // retryable → stays queued
      } catch {
        failed++;
      }
    }
    if (flushedIds.size > 0) {
      setMessages(prev => prev.map(m => (m.id && flushedIds.has(m.id) ? { ...m, status: 'sent' } : m)));
      addLog(`[OUTBOX: delivered ${delivered}${deduped ? ` · deduped ${deduped}` : ''}${failed ? ` · ${failed} still queued` : ''}]`);
    }
    flushingRef.current = false;
  }, [backendMode, supabase, addLog, insertMessageSafe]);

  // Flush the outbox when connectivity returns, after boot, and periodically
  useEffect(() => {
    if (backendMode !== 'online') return;
    const onOnline = () => { flushOutbox(); };
    window.addEventListener('online', onOnline);
    flushOutbox();
    const t = window.setTimeout(() => flushOutbox(), 4000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearTimeout(t);
    };
  }, [backendMode, flushOutbox]);

  const sendMessage = async (
    text: string,
    file?: File | null,
    replyToId?: string | null,
    burnOverride?: boolean,
    /** story replies / deep links: send into a chat that is not (yet) the active one */
    chatOverride?: Chat
  ) => {
    const targetChat = chatOverride || activeChat;
    if (!targetChat || !deviceId) return;
    const burnOnRead = burnOverride ?? settingsRef.current.burnOnRead;

    if (backendMode === 'online') {
      if (!supabase) return;
      // Phase 5 S3/S4: resolve the conversation key — E2EE DMs use the
      // on-device conversation key; everything else the share_code model.
      const chatKey = await chatKeyOf(supabase, targetChat, account?.username || '', true);
      const encryptedText = encryptText(text, chatKey);
      let fileUrl = null;

      if (settingsRef.current.allowFiles && file) {
        // Phase 5 S4: bytes are AES-GCM-encrypted with the conversation key
        // BEFORE upload; the private bucket stores ciphertext only.
        try {
          const plainBuf = await file.arrayBuffer();
          const cipherBuf = await encryptBytes(chatKey, plainBuf);
          const fileName = `${targetChat.id}/${crypto.randomUUID()}.enc`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(fileName, cipherBuf, { contentType: 'application/octet-stream' });

          if (uploadData) {
            // Store "path|mime|name" — encrypted in the message row. The
            // receiver renders it via a membership-gated signed URL.
            fileUrl = encryptText(`${uploadData.path}|${file.type || 'application/octet-stream'}|${file.name}`, chatKey);
          } else {
            // Storage unavailable (e.g. bucket not created yet): embed the
            // attachment as an encrypted payload so files ALWAYS transmit.
            const dataUrl = await fileToDataUrl(file);
            if (dataUrl) {
              fileUrl = encryptText(dataUrl, chatKey);
              addLog(`[UPLOAD: Cloud storage unavailable (${uploadError?.message || 'unknown error'}). Attachment embedded as encrypted payload.]`);
            } else {
              addLog('[UPLOAD: Failed to read attachment. No payload attached.]');
            }
          }
        } catch (encErr) {
          console.error('Encrypted upload failed:', encErr);
          const dataUrl = await fileToDataUrl(file);
          if (dataUrl) {
            fileUrl = encryptText(dataUrl, chatKey);
            addLog('[UPLOAD: Encrypted upload failed — attachment embedded as encrypted payload.]');
          } else {
            addLog('[UPLOAD: Failed to read attachment. No payload attached.]');
          }
        }
      }

      if (targetChat.share_code.startsWith('EPH-')) {
        const ephPayload = {
          id: crypto.randomUUID(),
          chat_id: targetChat.id,
          sender_id: deviceId,
          text: encryptedText,
          file_url: fileUrl,
          reply_to_id: replyToId,
          created_at: new Date().toISOString(),
        };

        if (presenceChannel) {
          presenceChannel.send({
            type: 'broadcast',
            event: 'EPH_MSG',
            payload: ephPayload,
          });

          const decryptedText = text ? decryptText(encryptedText, targetChat.share_code) : '';
          const decryptedFileUrl = fileUrl ? decryptText(fileUrl, targetChat.share_code) : null;
          setMessages(prev => [...prev, {
            ...ephPayload,
            text: decryptedText,
            file_url: decryptedFileUrl,
            burn_on_read: false,
            read_by: [],
          }]);
        } else {
          console.error("No presence channel available to broadcast ephemeral message.");
        }
      } else {
        const msgId = crypto.randomUUID();
        const now = new Date().toISOString();
        // Phase D: optimistic PENDING row rendered BEFORE the network hop.
        // The stable client_tag makes every retry idempotent — the unique
        // (chat_id, client_tag) index turns an already-landed retry into a
        // 23505 dedupe instead of a duplicate message.
        const clientTag = crypto.randomUUID();
        setMessages(prev => {
          if (prev.some(m => m.id === msgId)) return prev;
          return [...prev, {
            id: msgId,
            chat_id: targetChat.id,
            sender_id: deviceId,
            text,
            file_url: fileUrl ? decryptText(fileUrl, chatKey) : null,
            burn_on_read: burnOnRead,
            reply_to_id: replyToId,
            read_by: [],
            created_at: now,
            client_tag: clientTag,
            status: 'pending',
          }];
        });

        const payload = {
          id: msgId,
          chat_id: targetChat.id,
          sender_id: deviceId,
          text: encryptedText,
          file_url: fileUrl,
          burn_on_read: burnOnRead,
          reply_to_id: replyToId ?? null,
          read_by: [] as string[],
          created_at: now,
          client_tag: clientTag,
        };
        const { error } = await insertMessageSafe(payload);

        if (error) {
          // Cloud delivery failed (offline / RLS / network): mark FAILED and
          // queue in the durable outbox under the SAME client_tag for an
          // idempotent retry (tap-to-retry in the UI, auto-flush on reconnect).
          console.error('Send message error:', error);
          setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, status: 'failed' } : m)));
          queueForRetry({
            client_tag: clientTag,
            id: msgId,
            chat_id: targetChat.id,
            share_code: targetChat.share_code,
            payload: {
              id: msgId,
              chat_id: targetChat.id,
              sender_id: deviceId,
              text: encryptedText,
              file_url: fileUrl,
              burn_on_read: burnOnRead,
              reply_to_id: replyToId ?? null,
              read_by: [],
              created_at: now,
            },
            queued_at: now,
          });
          writeJSON('axon_messages', [...readJSON<Message[]>('axon_messages', []), { ...payload } as Message]);
          addLog(`[MSG: Cloud delivery failed (${error.message}). Queued in outbox — retry available.]`);
          return;
        }

        // Server ack → SENT. The realtime echo is deduped by id.
        setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, status: 'sent' } : m)));
      }

      addLog(`Sent payload to ${targetChat.share_code}`);
      return;
    }

    // LOCAL MODE
    const encryptedText = encryptText(text, targetChat.share_code);
    let fileUrl: string | null = null;

    if (settingsRef.current.allowFiles && file) {
      const dataUrl = await fileToDataUrl(file);
      if (dataUrl) fileUrl = encryptText(dataUrl, targetChat.share_code);
    }

    const raw: Message = {
      id: crypto.randomUUID(),
      chat_id: targetChat.id,
      sender_id: deviceId,
      text: encryptedText,
      file_url: fileUrl,
      burn_on_read: burnOnRead,
      reply_to_id: replyToId,
      read_by: [],
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, toDisplayMessage(raw, targetChat.share_code)]);
    writeJSON('axon_messages', [...readJSON<Message[]>('axon_messages', []), raw]);
    scheduleDestruct(raw);
    addLog(`Sent payload to ${targetChat.share_code}`);
  };

  const purgeTerminal = useCallback(() => {
    if (activeChat) {
      // Remove all messages for this terminal from localStorage in local mode
      const allMsgs = readJSON<Message[]>('axon_messages', []);
      writeJSON('axon_messages', allMsgs.filter(m => m.chat_id !== activeChat.id));
    }
    setMessages([]);
  }, [activeChat]);

  const deleteMessageLocally = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
    if (backendMode !== 'online') {
      writeJSON('axon_messages', readJSON<Message[]>('axon_messages', []).filter(m => m.id !== id));
    } else if (supabase) {
      supabase.from('messages').delete().eq('id', id).then();
    }
  }, [backendMode]);

  const addSystemMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      chat_id: activeChat?.id || 'sys',
      sender_id: 'SYSTEM',
      text,
      file_url: null,
      burn_on_read: false,
      created_at: new Date().toISOString(),
    }]);
  }, [activeChat]);

  const editMessage = useCallback((msgId: string, newText: string) => {
    if (!activeChat) return;
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: newText, edited: true } : m));
    if (backendMode !== 'online') {
      const allMsgs = readJSON<Message[]>('axon_messages', []);
      writeJSON('axon_messages', allMsgs.map(m => m.id === msgId ? { ...m, text: encryptText(newText, activeChat.share_code), edited: true } : m));
    } else if (supabase) {
      // Phase 5 S3: re-encrypt edits under the resolved conversation key.
      (async () => {
        const chatKey = await chatKeyOf(supabase, activeChat, account?.username || '', true);
        supabase.from('messages').update({ text: encryptText(newText, chatKey), edited: true }).eq('id', msgId).then();
      })();
    }
    addLog(`Message ${msgId.slice(0, 6)}... edited`);
  }, [activeChat, backendMode, addLog, account, supabase]);

  const toggleReaction = useCallback((msgId: string, emoji: string) => {
    if (!activeChat || !deviceId) return;
    let nextReactions: Reaction[] = [];
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = m.reactions || [];
      const existing = reactions.findIndex(r => r.emoji === emoji && r.user_id === deviceId);
      nextReactions = existing >= 0
        ? reactions.filter((_, i) => i !== existing)
        : [...reactions, { emoji, user_id: deviceId }];
      return { ...m, reactions: nextReactions };
    }));
    if (backendMode !== 'online' && activeChat) {
      const allMsgs = readJSON<Message[]>('axon_messages', []);
      const msg = allMsgs.find(m => m.id === msgId);
      if (msg) {
        const reactions = msg.reactions || [];
        const existing = reactions.findIndex((r: any) => r.emoji === emoji && r.user_id === deviceId);
        msg.reactions = existing >= 0
          ? reactions.filter((_: any, i: number) => i !== existing)
          : [...reactions, { emoji, user_id: deviceId }];
        writeJSON('axon_messages', allMsgs);
      }
    } else if (supabase) {
      // Instagram reactions SYNC across devices: persist + realtime UPDATE
      supabase.from('messages').update({ reactions: nextReactions }).eq('id', msgId).then();
    }
  }, [activeChat, deviceId, backendMode]);

  const togglePinMessage = useCallback((msgId: string) => {
    if (!activeChat) return;
    const nowPinned = !messages.find(m => m.id === msgId)?.pinned;
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, pinned: !m.pinned } : m));
    if (backendMode !== 'online' && activeChat) {
      const allMsgs = readJSON<Message[]>('axon_messages', []);
      const msg = allMsgs.find(m => m.id === msgId);
      if (msg) { msg.pinned = !msg.pinned; writeJSON('axon_messages', allMsgs); }
    } else if (supabase) {
      // Pinned state syncs like Instagram: persist + realtime UPDATE
      supabase.from('messages').update({ pinned: nowPinned }).eq('id', msgId).then();
    }
    addLog(`Message ${msgId.slice(0, 6)}... ${nowPinned ? 'pinned' : 'unpinned'}`);
  }, [activeChat, backendMode, messages, addLog]);

  const markAsRead = useCallback((msgId: string) => {
    if (!activeChat) return;
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const readBy = m.read_by || [];
      if (readBy.includes(deviceId)) return m;
      return { ...m, read_by: [...readBy, deviceId] };
    }));
  }, [activeChat, deviceId]);

  const resendMessage = useCallback(async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    if (backendMode !== 'online' || !supabase || !activeChat) {
      // Local mode has no cloud to retry against — the row already lives in
      // localStorage; just clear the failed marker.
      setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, status: 'sent' } : m)));
      return;
    }
    // Idempotent retry (Phase D): SAME client_tag → the unique (chat_id,
    // client_tag) index de-duplicates an already-delivered attempt (23505),
    // so a retry can never create a second copy of the message.
    const clientTag = msg.client_tag || crypto.randomUUID();
    setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, status: 'pending' } : m)));
    const chatKey = await chatKeyOf(supabase, activeChat, account?.username || '', true);
    const { error } = await insertMessageSafe({
      id: msg.id,
      chat_id: msg.chat_id,
      sender_id: msg.sender_id,
      text: encryptText(msg.text, chatKey),
      file_url: msg.file_url ? encryptText(msg.file_url, chatKey) : null,
      burn_on_read: msg.burn_on_read,
      reply_to_id: msg.reply_to_id ?? null,
      read_by: [],
      created_at: msg.created_at,
      client_tag: clientTag,
    });
    const kind = error ? classifyFlushError((error as any).code, error.message) : 'duplicate';
    if (!error || kind === 'duplicate') {
      setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, status: 'sent' } : m)));
      removeFromOutbox(clientTag);
      addLog(error ? '[MSG: retry deduped — payload was already delivered]' : '[MSG: retry delivered]');
    } else {
      setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, status: 'failed' } : m)));
      queueForRetry({
        client_tag: clientTag,
        id: msg.id,
        chat_id: msg.chat_id,
        share_code: activeChat.share_code,
        payload: {
          id: msg.id,
          chat_id: msg.chat_id,
          sender_id: msg.sender_id,
          text: encryptText(msg.text, chatKey),
          file_url: msg.file_url ? encryptText(msg.file_url, chatKey) : null,
          burn_on_read: msg.burn_on_read,
          reply_to_id: msg.reply_to_id ?? null,
          read_by: [],
          created_at: msg.created_at,
        },
        queued_at: new Date().toISOString(),
      });
      addLog(`[MSG: retry failed (${error.message}). Still queued.]`);
    }
  }, [messages, backendMode, supabase, activeChat, encryptText, addLog, insertMessageSafe]);

  /* ------------------- Instagram: unsend + forward + groups ------------------- */

  /** Instagram "Unsend": tombstone the row — cleared for EVERYONE via realtime. */
  const unsendMessage = useCallback((msgId: string) => {
    if (!activeChat) return;
    setMessages(prev => prev.map(m => (m.id === msgId
      ? { ...m, unsent: true, text: '', file_url: null, reactions: [] }
      : m)));
    if (backendMode !== 'online') {
      writeJSON('axon_messages', readJSON<Message[]>('axon_messages', []).map(m => (m.id === msgId
        ? { ...m, unsent: true, text: '', file_url: null, reactions: [] }
        : m)));
    } else if (supabase) {
      supabase.from('messages').update({ unsent: true, text: '', file_url: null, reactions: [] }).eq('id', msgId).then();
    }
    addLog(`Message ${msgId.slice(0, 6)}... unsent`);
  }, [activeChat, backendMode, addLog]);

  /** Forward a message's (decrypted) content into another encrypted channel. */
  const forwardMessage = useCallback(async (msg: Message, targetChat: Chat) => {
    const online = backendMode === 'online' && !!supabase;
    // Phase 5 S3: re-encrypt under the TARGET chat's resolved key.
    const targetKey = online && supabase
      ? await chatKeyOf(supabase, targetChat, account?.username || '', true)
      : targetChat.share_code;
    const encryptedText = msg.text ? encryptText(msg.text, targetKey) : '';
    const encryptedFile = msg.file_url ? encryptText(msg.file_url, targetKey) : null;
    if (backendMode === 'online' && supabase) {
      const { error } = await supabase.from('messages').insert({
        chat_id: targetChat.id,
        sender_id: deviceId,
        text: encryptedText,
        file_url: encryptedFile,
        burn_on_read: false,
        reply_to_id: null,
        read_by: [],
        created_at: new Date().toISOString(),
      });
      if (error) {
        addLog(`Forward failed: ${error.message}`);
        return;
      }
    } else {
      const raw: Message = {
        id: crypto.randomUUID(),
        chat_id: targetChat.id,
        sender_id: deviceId,
        text: encryptedText,
        file_url: encryptedFile,
        burn_on_read: false,
        reply_to_id: null,
        read_by: [],
        created_at: new Date().toISOString(),
      };
      writeJSON('axon_messages', [...readJSON<Message[]>('axon_messages', []), raw]);
      if (activeChat?.id === targetChat.id) {
        setMessages(prev => [...prev, toDisplayMessage(raw, targetChat.share_code)]);
      }
    }
    addLog(`Message forwarded to ${targetChat.name}`);
  }, [backendMode, deviceId, encryptText, activeChat, addLog]);

  /** Instagram group DM: named encrypted channel + one invite per member. */
  const createGroupChat = useCallback(async (
    name: string,
    memberUsernames: string[]
  ): Promise<{ ok: boolean; chat?: Chat; error?: string }> => {
    const groupName = name.trim().slice(0, 40);
    if (!account) return { ok: false, error: 'Sign in to create group chats.' };
    if (backendMode !== 'online' || !supabase) return { ok: false, error: 'Group chats need the cloud backend (online mode).' };
    if (!groupName) return { ok: false, error: 'Give the group a name.' };

    const me = account.username.toLowerCase();
    const members = [...new Set(memberUsernames.map(u => u.trim().toLowerCase().replace(/^@/, '')))].filter(u => u && u !== me);
    if (members.length === 0) return { ok: false, error: 'Add at least one member.' };

    // FOLLOW GATE: groups are only for people you follow (Instagram-style).
    const myFollowing = new Set(await fetchFollowing(supabase, me));
    const notFollowed = members.filter(u => !myFollowing.has(u));
    if (notFollowed.length > 0) {
      return {
        ok: false,
        error: `You can only add people you follow: ${notFollowed.map(u => `@${u}`).join(', ')}.`,
      };
    }

    const shareCode = generateDmPasscode();
    const { data, error } = await supabase
      .from('chats')
      .insert({ name: groupName, share_code: shareCode })
      .select()
      .single();
    if (error || !data) {
      console.error('Group create error:', error);
      return { ok: false, error: 'Could not create the group. Is the backend set up?' };
    }

    // One invite per member — the existing DM delivery auto-joins everyone
    for (const member of members) {
      const sent = await sendDmInvite(supabase, member, data.id, data.share_code, me);
      if (!sent) addLog(`Invite to @${member} failed — they can still find the group via search`);
    }

    // Member-scoped RLS (schema v2) admits everyone via membership rows
    await insertChatParticipants(supabase, data.id, [me, ...members]);

    admitDmChat(data as Chat);
    setActiveChat(data as Chat);
    addLog(`Group "${groupName}" created with ${members.length} member(s)`);
    return { ok: true, chat: data as Chat };
  }, [account, backendMode, admitDmChat, addLog]);

  /* ────────────────────────────────────────────────────────────────────
     WebRTC Calling Engine — real P2P audio/video calls.
     Signaling rides the existing Supabase Realtime room channel via
     broadcast event 'webrtc'. Roles are strict: caller = answerer,
     callee = offerer (offer is created only after the callee accepts).
     ──────────────────────────────────────────────────────────────────── */
  const [callingChat, setCallingChat] = useState<CallTarget | null>(null);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [messagesInView, setMessagesInView] = useState<string[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const callMetaRef = useRef<{ chatId: string; callId: string; role: 'caller' | 'callee'; type: 'audio' | 'video' } | null>(null);
  const ringTimeoutRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const callStatusRef = useRef<CallStatus>('idle');

  useEffect(() => { callStatusRef.current = callStatus; }, [callStatus]);

  const sendSignal = useCallback((chatId: string, kind: string, extra: Record<string, unknown> = {}) => {
    if (!presenceChannel) return;
    presenceChannel.send({
      type: 'broadcast',
      event: 'webrtc',
      payload: { kind, chatId, from: deviceId, alias, callId: callMetaRef.current?.callId, ...extra },
    });
  }, [presenceChannel, deviceId, alias]);

  const clearCallTimers = useCallback(() => {
    if (ringTimeoutRef.current !== null) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    if (connectTimeoutRef.current !== null) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
  }, []);

  const teardownCall = useCallback((opts?: { notify?: boolean; reason?: string }) => {
    clearCallTimers();
    if (opts?.notify && callMetaRef.current) {
      sendSignal(callMetaRef.current.chatId, 'call-end', { reason: opts.reason });
    }
    try { pcRef.current?.close(); } catch { /* already closed */ }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pendingIceRef.current = [];
    pendingOfferRef.current = null;
    callMetaRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallingChat(null);
    setCallType(null);
    setCallStatus('idle');
    setIncomingCall(null);
    setCallNotice(null);
  }, [clearCallTimers, sendSignal]);

  const acquireMedia = useCallback(async (type: 'audio' | 'video') => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video' ? { width: { ideal: 1280 }, facingMode: 'user' } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const createPeer = useCallback((chatId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
    });

    localStreamRef.current?.getTracks().forEach(track => {
      if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
    });

    const remote = new MediaStream();
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach(t => {
        if (!remote.getTracks().some(existing => existing.id === t.id)) remote.addTrack(t);
      });
      setRemoteStream(new MediaStream(remote.getTracks()));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(chatId, 'call-ice', { candidate: event.candidate.toJSON() });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearCallTimers();
        setCallStatus('connected');
        setCallNotice(null);
        addLog('[CALL] Peer connection established');
      } else if (pc.connectionState === 'failed') {
        setCallStatus('failed');
        setCallNotice('CONNECTION FAILED');
        addLog('[CALL] Peer connection failed');
      }
    };

    pcRef.current = pc;
    return pc;
  }, [sendSignal, clearCallTimers, addLog]);

  const applyRemoteOffer = useCallback(async (sdp: RTCSessionDescriptionInit) => {
    const pc = pcRef.current;
    if (!pc) { pendingOfferRef.current = sdp; return; }
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const meta = callMetaRef.current;
    if (meta) sendSignal(meta.chatId, 'call-answer', { sdp: pc.localDescription });
    for (const c of pendingIceRef.current.splice(0)) {
      await pc.addIceCandidate(c).catch(() => { /* stale candidate */ });
    }
  }, [sendSignal]);

  const handleSignal = useCallback(async (p: any) => {
    if (!p || p.from === deviceId) return;
    const meta = callMetaRef.current;

    switch (p.kind) {
      case 'call-invite': {
        if (meta || incomingCall) {
          sendSignal(p.chatId, 'call-end', { callId: p.callId, reason: 'busy' });
          return;
        }
        setIncomingCall({
          chatId: p.chatId,
          chatName: p.chatName || 'UNKNOWN TERMINAL',
          callId: p.callId,
          type: p.callType === 'video' ? 'video' : 'audio',
          fromDeviceId: p.from,
          fromAlias: p.alias || 'UNKNOWN NODE',
        });
        addLog(`[CALL] Incoming ${p.callType} call from ${p.alias || p.from}`);
        window.setTimeout(() => {
          setIncomingCall(cur => (cur && cur.callId === p.callId ? null : cur));
        }, 30000);
        break;
      }
      case 'call-accept': {
        if (!meta || meta.role !== 'caller' || p.callId !== meta.callId) return;
        clearCallTimers();
        setCallStatus('connecting');
        try {
          await acquireMedia(meta.type);
          const pc = createPeer(meta.chatId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal(meta.chatId, 'call-offer', { sdp: pc.localDescription });
          connectTimeoutRef.current = window.setTimeout(() => {
            if (pcRef.current && pcRef.current.connectionState !== 'connected') {
              setCallStatus('failed');
              setCallNotice('PEER UNREACHABLE');
              addLog('[CALL] Connect timeout');
            }
          }, 20000);
        } catch {
          setCallStatus('failed');
          setCallNotice('MEDIA ACCESS DENIED');
          sendSignal(meta.chatId, 'call-end', { reason: 'media-error' });
        }
        break;
      }
      case 'call-offer': {
        if (!meta || meta.role !== 'callee' || p.callId !== meta.callId) return;
        await applyRemoteOffer(p.sdp);
        break;
      }
      case 'call-answer': {
        if (!meta || meta.role !== 'caller' || p.callId !== meta.callId || !pcRef.current) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(p.sdp));
        for (const c of pendingIceRef.current.splice(0)) {
          await pcRef.current.addIceCandidate(c).catch(() => { /* stale candidate */ });
        }
        break;
      }
      case 'call-ice': {
        if (!meta || p.callId !== meta.callId || !p.candidate) return;
        const pc = pcRef.current;
        if (pc?.remoteDescription) {
          await pc.addIceCandidate(p.candidate).catch(() => { /* stale candidate */ });
        } else {
          pendingIceRef.current.push(p.candidate);
        }
        break;
      }
      case 'call-end': {
        if (incomingCall && incomingCall.callId === p.callId && !meta) {
          setIncomingCall(null);
          addLog('[CALL] Incoming call cancelled by caller');
          return;
        }
        if (meta && p.callId === meta.callId) {
          teardownCall();
          if (p.reason === 'declined' || p.reason === 'busy' || p.reason === 'media-error') {
            setCallStatus('failed');
            setCallNotice(p.reason === 'declined' ? 'CALL DECLINED' : p.reason === 'busy' ? 'PEER BUSY' : 'PEER MEDIA ERROR');
          }
          addLog(`[CALL] Closed by peer (${p.reason || 'hangup'})`);
        }
        break;
      }
    }
  }, [deviceId, incomingCall, sendSignal, addLog, clearCallTimers, acquireMedia, createPeer, applyRemoteOffer, teardownCall]);

  // Route signals from the room channel through a ref (stable across renders)
  const webrtcSignalRef = useRef<(p: any) => void>(() => {});
  useEffect(() => {
    webrtcSignalRef.current = (p: any) => { void handleSignal(p); };
  }, [handleSignal]);

  const startCall = useCallback((chat: Chat, type: 'audio' | 'video') => {
    if (callingChat || incomingCall) return;
    if (!presenceChannel) {
      setCallingChat({ id: chat.id, name: chat.name });
      setCallType(type);
      setCallStatus('failed');
      setCallNotice('SIGNALING OFFLINE — CONNECT TO CLOUD');
      return;
    }
    const callId = `${deviceId}-${Date.now()}`;
    callMetaRef.current = { chatId: chat.id, callId, role: 'caller', type };
    setCallingChat({ id: chat.id, name: chat.name });
    setCallType(type);
    setCallStatus('ringing');
    setCallNotice(null);
    addLog(`[CALL] ${type.toUpperCase()} call initiated on ${chat.name}`);
    sendSignal(chat.id, 'call-invite', { callId, callType: type, chatName: chat.name });
    ringTimeoutRef.current = window.setTimeout(() => {
      if (callMetaRef.current?.callId === callId && callStatusRef.current === 'ringing') {
        sendSignal(chat.id, 'call-end', { callId, reason: 'timeout' });
        teardownCall();
        setCallStatus('failed');
        setCallNotice('NO ANSWER');
        addLog('[CALL] No answer — timed out');
      }
    }, 30000);
  }, [callingChat, incomingCall, presenceChannel, deviceId, sendSignal, addLog, teardownCall]);

  const acceptIncomingCall = useCallback(async () => {
    const inv = incomingCall;
    if (!inv) return;
    setIncomingCall(null);
    callMetaRef.current = { chatId: inv.chatId, callId: inv.callId, role: 'callee', type: inv.type };
    setCallingChat({ id: inv.chatId, name: inv.chatName });
    setCallType(inv.type);
    setCallStatus('connecting');
    sendSignal(inv.chatId, 'call-accept', { callId: inv.callId });
    try {
      await acquireMedia(inv.type);
      createPeer(inv.chatId);
      const buffered = pendingOfferRef.current;
      pendingOfferRef.current = null;
      if (buffered) await applyRemoteOffer(buffered);
      connectTimeoutRef.current = window.setTimeout(() => {
        if (pcRef.current && pcRef.current.connectionState !== 'connected') {
          setCallStatus('failed');
          setCallNotice('PEER UNREACHABLE');
        }
      }, 20000);
      addLog('[CALL] Accepted incoming call');
    } catch {
      setCallStatus('failed');
      setCallNotice('MEDIA ACCESS DENIED');
      sendSignal(inv.chatId, 'call-end', { reason: 'media-error' });
    }
  }, [incomingCall, sendSignal, acquireMedia, createPeer, applyRemoteOffer, addLog]);

  const rejectIncomingCall = useCallback(() => {
    const inv = incomingCall;
    if (!inv) return;
    setIncomingCall(null);
    sendSignal(inv.chatId, 'call-end', { callId: inv.callId, reason: 'declined' });
    addLog('[CALL] Incoming call declined');
  }, [incomingCall, sendSignal, addLog]);

  const endCall = useCallback(() => {
    teardownCall({ notify: true, reason: 'hangup' });
    addLog('[CALL] Call ended');
  }, [teardownCall, addLog]);

  const getCallRtt = useCallback(async (): Promise<number | null> => {
    const pc = pcRef.current;
    if (!pc) return null;
    try {
      const stats = await pc.getStats();
      let rtt: number | null = null;
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && (report as any).state === 'succeeded' && (report as any).currentRoundTripTime != null) {
          rtt = (report as any).currentRoundTripTime * 1000;
        }
      });
      return rtt;
    } catch {
      return null;
    }
  }, []);

  // End call automatically if the active terminal changes mid-call
  useEffect(() => {
    if (callingChat && activeChat && callingChat.id !== activeChat.id) endCall();
  }, [activeChat, callingChat, endCall]);

  // Full teardown on unmount (ref-indirected to avoid dep-driven restarts)
  const teardownRef = useRef(teardownCall);
  useEffect(() => { teardownRef.current = teardownCall; }, [teardownCall]);
  useEffect(() => () => teardownRef.current(), []);

  return (
    <CryptoContext.Provider
      value={{
        deviceId, alias, chats, archivedChats, activeChat, messages, hasMoreMessages, messagesReloadKey, bumpMessagesReload, scrubConversation, loadingOlder, loadOlderMessages, latency,
        setActiveChat, createChat, joinChat, sendMessage, purgeTerminal,
        addSystemMessage, deleteMessageLocally, editMessage, toggleReaction, togglePinMessage, markAsRead, resendMessage,
        updateAlias, systemLogs,
        addLog, clearLogs, networkStatus, renameChat, archiveChat, restoreChat, deleteChat, changeChatPassword,
        onlineUsers, typingUsers, broadcastTyping, simBotActive, toggleSimBot,
        unlockedChatId, unlockChat, lockChat, backendMode, pushLocalToCloud,
        settings, updateSettings,
        myGradient, updateMyGradient,
        account, loginWithAccount, logout, searchAccounts, startDmWithUser,
        createGroupChat, unsendMessage, forwardMessage,
        fetchGroupMembers, addGroupMember, removeGroupMember, leaveGroup,
        callingChat, callType, callStatus, callNotice, incomingCall, localStream, remoteStream,
        startCall, endCall, acceptIncomingCall, rejectIncomingCall, getCallRtt, messagesInView, setMessagesInView,
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (context === undefined) {
    throw new Error('useCrypto must be used within a CryptoProvider');
  }
  return context;
};

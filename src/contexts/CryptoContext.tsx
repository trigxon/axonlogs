import { createContext, useContext, useState, useEffect, type ReactNode, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import CryptoJS from 'crypto-js';

export interface Chat {
  id: string;
  name: string;
  share_code: string;
  created_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  file_url: string | null;
  burn_on_read: boolean;
  reply_to_id?: string | null;
  read_by?: string[];
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
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  burnOnRead: true,
  burnDelaySeconds: 10,
  allowFiles: true,
  allowVoice: true,
  stealthMode: false,
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
  latency: number;
  setActiveChat: (chat: Chat) => void;
  createChat: (customName?: string, customCode?: string, isEphemeral?: boolean) => Promise<boolean>;
  joinChat: (code: string) => Promise<boolean>;
  sendMessage: (text: string, file?: File | null, replyToId?: string | null) => Promise<void>;
  purgeTerminal: () => void;
  addSystemMessage: (text: string) => void;
  deleteMessageLocally: (id: string) => void;
  renameChat: (id: string, newName: string) => Promise<void>;
  archiveChat: (id: string) => void;
  restoreChat: (id: string) => void;
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
  const [deviceId, setDeviceId] = useState<string>('');
  const [alias, setAlias] = useState<string>('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [archivedChats, setArchivedChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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
    setSystemLogs(prev => [{ id: crypto.randomUUID(), time: new Date().toISOString(), msg }, ...prev]);
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

    setDeviceId(storedId);
    setAlias(storedAlias);
    addLog(`Identity initialized: ${storedId.substring(0, 8)}...`);
    setNetworkStatus(isOnline ? 'ONLINE' : 'LOCAL');
  }, [addLog]);

  // Seeds (or preserves) the local sandbox terminal used in local/degraded mode
  const seedLocalSandbox = useCallback(() => {
    // NOTE: no chat is auto-selected on entry — the user clicks a terminal and
    // only then is the passcode demanded (lazy load, no data touched up front).
    const existing = readJSON<Chat[]>('axon_chats', []);
    if (existing.length > 0) {
      setChats(existing);
      return;
    }
    const seed = makeLocalChat('AXON_SANDBOX', undefined, false, 1);
    writeJSON('axon_chats', [seed]);
    setChats([seed]);
    const welcome: Message = {
      id: crypto.randomUUID(),
      chat_id: seed.id,
      sender_id: 'SYSTEM',
      text: '[SYSTEM: LOCAL SANDBOX TERMINAL INITIALIZED. NO SUPABASE CREDENTIALS DETECTED - RUNNING FULLY OFFLINE E2EE MODE. TYPE /HELP FOR COMMANDS.]',
      file_url: null,
      burn_on_read: false,
      created_at: new Date().toISOString(),
    };
    writeJSON('axon_messages', [welcome]);
    addLog('Initialized local sandbox terminal (offline mode)');
  }, [addLog]);

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
          } else {
            // No terminals exist anywhere yet - bootstrap the first one
            await createChat();
          }
          void migrateLocalToCloud();
        } catch (e: any) {
          // Backend missing/unreachable -> degrade to the local sandbox instead of alerting
          console.error("Supabase unavailable, degrading to local sandbox:", e?.message || e);
          setBackendMode('local');
          setNetworkStatus('LOCAL');
          addLog('Supabase backend unavailable - degraded to LOCAL SANDBOX MODE');
          seedLocalSandbox();
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
      if (localChats.length === 0) {
        seedLocalSandbox();
      } else {
        setChats(localChats);
        // LAZY LOAD: stay on STANDBY until the user clicks a terminal.
        // Only an explicit ?room=CODE deep link selects a chat.
        const roomParam = new URLSearchParams(window.location.search).get('room');
        if (roomParam) {
          const target = localChats.find(c => c.share_code === roomParam.trim().toUpperCase());
          setActiveChat(target || null);
        } else {
          setActiveChat(null);
        }
      }
    }
  }, [deviceId, backendMode, seedLocalSandbox]);

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
        // Backend unavailable (missing tables / RLS / auth / network) -> degrade to the local sandbox
        setBackendMode('local');
        setNetworkStatus('LOCAL');
        addLog('Supabase backend unavailable - degraded to LOCAL SANDBOX MODE');
        seedLocalSandbox();
        // If the operator explicitly requested a named/custom tunnel, create it locally too
        if (customName || customCode) {
          const chat = makeLocalChat(customName, customCode, isEphemeral, chats.length + 1);
          const next = [chat, ...chats];
          writeJSON('axon_chats', next);
          setChats(next);
          setActiveChat(chat);
          addLog(`Created channel ${chat.name} [${chat.share_code}] (LOCAL SANDBOX)`);
        }
        return true;
      }
      if (data) {
        saveKnownChat(data.id);
        saveDeviceKey(data.id, data.share_code);
        setChats(prev => [data, ...prev]);
        setActiveChat(data);
        addLog(`Created channel ${data.name} [KEY SAVED TO DEVICE KEYRING]`);
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
      const { data, error } = await supabase.from('chats').select('*').eq('share_code', code).single();
      if (error) {
        console.error("Join chat error:", error);
        // PGRST116 = no matching row (invalid code). Anything else = backend down -> degrade.
        if ((error as any).code !== 'PGRST116') {
          setBackendMode('local');
          setNetworkStatus('LOCAL');
          addLog('Supabase backend unavailable - degraded to LOCAL SANDBOX MODE');
          seedLocalSandbox();
        }
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
      if (unlockedChatId !== activeChat.id) {
        setMessages([]);
        return;
      }
      setMessages([]);

      const fetchMessages = async () => {
        const { data } = await supabase!
          .from('messages')
          .select('*')
          .eq('chat_id', activeChat.id)
          .order('created_at', { ascending: true });

        if (data) {
          const decryptedMsgs = data.map(msg => {
            const decryptedText = msg.text ? decryptText(msg.text, activeChat.share_code) : '';
            const decryptedFileUrl = msg.file_url ? decryptText(msg.file_url, activeChat.share_code) : null;
            const hasTextError = msg.text ? !decryptedText : false;
            const hasFileError = msg.file_url ? !decryptedFileUrl : false;
            return {
              ...msg,
              text: hasTextError ? '[DECRYPTION FAILED - INVALID KEY]' : decryptedText,
              file_url: hasFileError ? null : decryptedFileUrl,
              isDecryptionError: hasTextError || hasFileError,
              read_by: msg.read_by || [],
            };
          });
          setMessages(decryptedMsgs);

          // Process read receipts
          decryptedMsgs.forEach(msg => {
            if (msg.sender_id !== deviceId && !msg.isDecryptionError && (!msg.read_by || !msg.read_by.includes(deviceId))) {
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
        }, (payload) => {
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

          const decryptedText = newMsg.text ? decryptText(newMsg.text, activeChat.share_code) : '';
          const decryptedFileUrl = newMsg.file_url ? decryptText(newMsg.file_url, activeChat.share_code) : null;
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

          if (newMsg.sender_id !== deviceId && !hasTextError && !hasFileError && (!newMsg.read_by || !newMsg.read_by.includes(deviceId))) {
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
  }, [activeChat, deviceId, alias, decryptText, scheduleDestruct, backendMode, unlockedChatId]);

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

  const sendMessage = async (text: string, file?: File | null, replyToId?: string | null) => {
    if (!activeChat || !deviceId) return;

    if (backendMode === 'online') {
      if (!supabase) return;
      const encryptedText = encryptText(text, activeChat.share_code);
      let fileUrl = null;

      if (settingsRef.current.allowFiles && file) {
        // Universal file upload (no accept constraints on input handled elsewhere)
        const fileExt = (file.name.split('.').pop() || 'bin').toLowerCase();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('chat_files')
          .upload(fileName, file);

        if (uploadData) {
          const { data: { publicUrl } } = supabase.storage
            .from('chat_files')
            .getPublicUrl(uploadData.path);

          fileUrl = encryptText(publicUrl, activeChat.share_code);
        } else {
          // Cloud storage unavailable (e.g. bucket not created yet): embed the
          // attachment as an encrypted payload so files ALWAYS transmit.
          const dataUrl = await fileToDataUrl(file);
          if (dataUrl) {
            fileUrl = encryptText(dataUrl, activeChat.share_code);
            addLog(`[UPLOAD: Cloud storage unavailable (${uploadError?.message || 'unknown error'}). Attachment embedded as encrypted payload.]`);
          } else {
            addLog('[UPLOAD: Failed to read attachment. No payload attached.]');
          }
        }
      }

      if (activeChat.share_code.startsWith('EPH-')) {
        const ephPayload = {
          id: crypto.randomUUID(),
          chat_id: activeChat.id,
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

          const decryptedText = text ? decryptText(encryptedText, activeChat.share_code) : '';
          const decryptedFileUrl = fileUrl ? decryptText(fileUrl, activeChat.share_code) : null;
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
        const { error } = await supabase.from('messages').insert({
          id: msgId,
          chat_id: activeChat.id,
          sender_id: deviceId,
          text: encryptedText,
          file_url: fileUrl,
          burn_on_read: settingsRef.current.burnOnRead,
          reply_to_id: replyToId,
          read_by: [],
          created_at: now,
        });

        if (error) {
          // Cloud delivery failed (missing table / RLS / offline) - keep the payload
          // locally so the message STILL sends instead of silently vanishing.
          console.error('Send message error:', error);
          const raw: Message = {
            id: msgId,
            chat_id: activeChat.id,
            sender_id: deviceId,
            text: encryptedText,
            file_url: fileUrl,
            burn_on_read: settingsRef.current.burnOnRead,
            reply_to_id: replyToId,
            read_by: [],
            created_at: now,
          };
          setMessages(prev => [...prev, toDisplayMessage(raw, activeChat.share_code)]);
          writeJSON('axon_messages', [...readJSON<Message[]>('axon_messages', []), raw]);
          addLog(`[MSG: Cloud delivery failed (${error.message}). Payload saved locally.]`);
          return;
        }

        // Optimistic render - the realtime echo is deduped by id
        setMessages(prev => {
          if (prev.some(m => m.id === msgId)) return prev;
          return [...prev, {
            id: msgId,
            chat_id: activeChat.id,
            sender_id: deviceId,
            text,
            file_url: fileUrl ? decryptText(fileUrl, activeChat.share_code) : null,
            burn_on_read: true,
            reply_to_id: replyToId,
            read_by: [],
            created_at: now,
          }];
        });
      }

      addLog(`Sent payload to ${activeChat.share_code}`);
      return;
    }

    // LOCAL MODE
    const encryptedText = encryptText(text, activeChat.share_code);
    let fileUrl: string | null = null;

    if (settingsRef.current.allowFiles && file) {
      const dataUrl = await fileToDataUrl(file);
      if (dataUrl) fileUrl = encryptText(dataUrl, activeChat.share_code);
    }

    const raw: Message = {
      id: crypto.randomUUID(),
      chat_id: activeChat.id,
      sender_id: deviceId,
      text: encryptedText,
      file_url: fileUrl,
      burn_on_read: settingsRef.current.burnOnRead,
      reply_to_id: replyToId,
      read_by: [],
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, toDisplayMessage(raw, activeChat.share_code)]);
    writeJSON('axon_messages', [...readJSON<Message[]>('axon_messages', []), raw]);
    scheduleDestruct(raw);
    addLog(`Sent payload to ${activeChat.share_code}`);
  };

  const purgeTerminal = useCallback(() => {
    setMessages([]);
  }, []);

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

  return (
    <CryptoContext.Provider
      value={{
        deviceId, alias, chats, archivedChats, activeChat, messages, latency,
        setActiveChat, createChat, joinChat, sendMessage, purgeTerminal,
        addSystemMessage, deleteMessageLocally, updateAlias, systemLogs,
        addLog, clearLogs, networkStatus, renameChat, archiveChat, restoreChat, deleteChat, changeChatPassword,
        onlineUsers, typingUsers, broadcastTyping, simBotActive, toggleSimBot,
        unlockedChatId, unlockChat, lockChat, backendMode, pushLocalToCloud,
        settings, updateSettings,
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

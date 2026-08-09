import { createContext, useContext, useState, useEffect, type ReactNode, useCallback } from 'react';
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
  created_at: string;
  isDecryptionError?: boolean;
}

export interface SystemLog {
  id: string;
  time: string;
  msg: string;
}

interface CryptoContextType {
  deviceId: string;
  alias: string;
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  latency: number;
  setActiveChat: (chat: Chat) => void;
  createChat: () => Promise<void>;
  joinChat: (code: string) => Promise<boolean>;
  sendMessage: (text: string, file?: File | null) => Promise<void>;
  purgeTerminal: () => void;
  addSystemMessage: (text: string) => void;
  deleteMessageLocally: (id: string) => void;
  renameChat: (id: string, newName: string) => Promise<void>;
  updateAlias: (newAlias: string) => void;
  systemLogs: SystemLog[];
  addLog: (msg: string) => void;
  networkStatus: string;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const CryptoProvider = ({ children }: { children: ReactNode }) => {
  const [deviceId, setDeviceId] = useState<string>('');
  const [alias, setAlias] = useState<string>('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [latency, setLatency] = useState(0);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [networkStatus, setNetworkStatus] = useState<string>('CONNECTING...');

  const addLog = useCallback((msg: string) => {
    setSystemLogs(prev => [{ id: crypto.randomUUID(), time: new Date().toISOString(), msg }, ...prev]);
  }, []);

  // Initialize identity
  useEffect(() => {
    let storedId = localStorage.getItem('axon_deviceId');
    let storedAlias = localStorage.getItem('axon_alias');
    
    if (!storedId) {
      storedId = crypto.randomUUID();
      localStorage.setItem('axon_deviceId', storedId);
    }
    if (!storedAlias) {
      storedAlias = `NODE_${storedId.substring(0,4).toUpperCase()}`;
      localStorage.setItem('axon_alias', storedAlias);
    }
    
    setDeviceId(storedId);
    setAlias(storedAlias);
    addLog(`Identity initialized: ${storedId.substring(0,8)}...`);
    setNetworkStatus(supabase ? 'ONLINE' : 'OFFLINE');
  }, [addLog]);

  // Fetch chats on init
  useEffect(() => {
    if (!supabase || !deviceId) return;

    const fetchChats = async () => {
      const storedChats = JSON.parse(localStorage.getItem('axon_known_chats') || '[]');
      
      if (storedChats.length === 0) {
        await createChat();
        return;
      }

      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .in('id', storedChats)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Fetch chats error:", error);
      }

      if (data && data.length > 0) {
        setChats(data);
        setActiveChat(data[0]);
      } else {
        await createChat();
      }
    };

    fetchChats();
  }, [deviceId]);

  const saveKnownChat = (chatId: string) => {
    const stored = JSON.parse(localStorage.getItem('axon_known_chats') || '[]');
    if (!stored.includes(chatId)) {
      stored.push(chatId);
      localStorage.setItem('axon_known_chats', JSON.stringify(stored));
    }
  };

  const createChat = async () => {
    if (!supabase) return;
    const shareCode = `AXN-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const newChat = {
      name: `CHANNEL_${shareCode}`,
      share_code: shareCode
    };

    const { data, error } = await supabase.from('chats').insert(newChat).select().single();
    if (error) {
      console.error("Create chat error:", error);
      alert(`Database Error: ${error.message}\nURL being used: ${supabaseUrl}`);
      // Fallback local chat so UI renders
      const mockChat = { id: 'mock', name: 'LOCAL_FALLBACK', share_code: 'ERR', created_at: new Date().toISOString() };
      setChats(prev => [mockChat, ...prev]);
      setActiveChat(mockChat);
      return;
    }
    if (data) {
      saveKnownChat(data.id);
      setChats(prev => [data, ...prev]);
      setActiveChat(data);
    }
  };

  const joinChat = async (code: string) => {
    if (!supabase) return false;
    const { data, error } = await supabase.from('chats').select('*').eq('share_code', code).single();
    if (error) {
      console.error("Join chat error:", error);
    }
    if (data) {
      saveKnownChat(data.id);
      setChats(prev => {
        if (!prev.find(c => c.id === data.id)) return [data, ...prev];
        return prev;
      });
      setActiveChat(data);
      return true;
    }
    return false;
  };

  const renameChat = async (id: string, newName: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('chats').update({ name: newName }).eq('id', id);
    if (error) console.error("Rename chat error:", error);
    setChats(prev => prev.map(c => c.id === id ? { ...c, name: newName } : c));
    if (activeChat?.id === id) {
      setActiveChat(prev => prev ? { ...prev, name: newName } : null);
    }
    addLog(`Renamed channel to ${newName}`);
  };

  const updateAlias = useCallback((newAlias: string) => {
    const cleanAlias = newAlias.trim().toUpperCase() || `NODE_${deviceId.substring(0,4)}`;
    setAlias(cleanAlias);
    localStorage.setItem('axon_alias', cleanAlias);
    addLog(`Alias updated to ${cleanAlias}`);
  }, [deviceId, addLog]);

  const decryptText = useCallback((encrypted: string, key: string) => {
    if (!encrypted) return '';
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, key);
      return bytes.toString(CryptoJS.enc.Utf8) || '';
    } catch {
      return '';
    }
  }, []);

  const encryptText = useCallback((raw: string, key: string) => {
    if (!raw) return '';
    return CryptoJS.AES.encrypt(raw, key).toString();
  }, []);

  // Fetch messages for active chat
  useEffect(() => {
    if (!supabase || !activeChat) return;
    setMessages([]);

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', activeChat.id)
        .order('created_at', { ascending: true });

      if (data) {
        const decryptedMsgs = data.map(msg => {
          const decryptedText = decryptText(msg.text, activeChat.share_code);
          return {
            ...msg,
            text: decryptedText || '[DECRYPTION FAILED - INVALID KEY]',
            isDecryptionError: !decryptedText
          };
        });
        setMessages(decryptedMsgs);

        // Delete burn-on-read messages that aren't ours
        data.forEach(msg => {
          if (msg.burn_on_read && msg.sender_id !== deviceId) {
            supabase.from('messages').delete().eq('id', msg.id).then();
          }
        });
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const subscription = supabase.channel(`public:messages:chat_id=${activeChat.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `chat_id=eq.${activeChat.id}`
      }, (payload) => {
        const newMsg = payload.new as Message;
        // Calculate latency for incoming messages
        if (newMsg.sender_id !== deviceId) {
           const msgTime = new Date(newMsg.created_at).getTime();
           setLatency(Date.now() - msgTime);
        }

        const decryptedText = decryptText(newMsg.text, activeChat.share_code);
        setMessages(prev => [...prev, {
          ...newMsg,
          text: decryptedText || '[DECRYPTION FAILED - INVALID KEY]',
          isDecryptionError: !decryptedText
        }]);

        if (newMsg.burn_on_read && newMsg.sender_id !== deviceId) {
          supabase.from('messages').delete().eq('id', newMsg.id).then();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [activeChat, deviceId, decryptText]);

  const sendMessage = async (text: string, file?: File | null) => {
    if (!supabase || !activeChat || !deviceId) return;

    const encryptedText = encryptText(text, activeChat.share_code);
    let fileUrl = null;

    if (file) {
      // Universal file upload (no accept constraints on input handled elsewhere)
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      
      const { data: uploadData } = await supabase.storage
        .from('chat_files')
        .upload(fileName, file);

      if (uploadData) {
        // Construct public URL
        const { data: urlData } = supabase.storage
          .from('chat_files')
          .getPublicUrl(uploadData.path);
        
        fileUrl = JSON.stringify({
          url: urlData.publicUrl,
          name: file.name,
          size: file.size,
          type: file.type
        });
      }
    }

    // Always burn on read by default for security, or let users toggle it. We'll set true for ephemeral nature.
    await supabase.from('messages').insert({
      chat_id: activeChat.id,
      sender_id: deviceId,
      text: encryptedText,
      file_url: fileUrl,
      burn_on_read: true
    });
    
    addLog(`Sent payload to ${activeChat.share_code}`);
  };

  const purgeTerminal = useCallback(() => {
    setMessages([]);
  }, []);

  const deleteMessageLocally = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  const addSystemMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      chat_id: activeChat?.id || 'sys',
      sender_id: 'SYSTEM',
      text,
      file_url: null,
      burn_on_read: false,
      created_at: new Date().toISOString()
    }]);
  }, [activeChat]);

  return (
    <CryptoContext.Provider
      value={{
        deviceId,
        alias,
        chats,
        activeChat,
        messages,
        latency,
        setActiveChat,
        createChat,
        joinChat,
        sendMessage,
        purgeTerminal,
        addSystemMessage,
        deleteMessageLocally,
        renameChat,
        updateAlias,
        systemLogs,
        addLog,
        networkStatus
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

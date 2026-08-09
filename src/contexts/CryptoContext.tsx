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
  }, []);

  // Fetch chats on init
  useEffect(() => {
    if (!supabase || !deviceId) return;

    const fetchChats = async () => {
      // For simplicity in this anonymous model, we'll just fetch all chats this device created or joined.
      // To simulate "joined" chats being remembered, we store known chat IDs in localStorage.
      const storedChats = JSON.parse(localStorage.getItem('axon_known_chats') || '[]');
      
      const { data } = await supabase
        .from('chats')
        .select('*')
        .in('id', storedChats)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        setChats(data);
        setActiveChat(data[0]);
      } else {
        // Create first chat automatically if none exist
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

    const { data } = await supabase.from('chats').insert(newChat).select().single();
    if (data) {
      saveKnownChat(data.id);
      setChats(prev => [data, ...prev]);
      setActiveChat(data);
    }
  };

  const joinChat = async (code: string) => {
    if (!supabase) return false;
    const { data } = await supabase.from('chats').select('*').eq('share_code', code).single();
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
    await supabase.from('chats').update({ name: newName }).eq('id', id);
    setChats(prev => prev.map(c => c.id === id ? { ...c, name: newName } : c));
    if (activeChat?.id === id) {
      setActiveChat(prev => prev ? { ...prev, name: newName } : null);
    }
  };

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
        renameChat
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

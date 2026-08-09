import { createContext, useContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import CryptoJS from 'crypto-js';

export interface Chat {
  id: string;
  name: string;
  share_code: string;
  created_at: string;
}

export interface MessagePayload {
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
  chats: Chat[];
  activeChat: Chat | null;
  messages: MessagePayload[];
  setActiveChat: (chat: Chat) => void;
  createChat: () => Promise<void>;
  joinChat: (shareCode: string) => Promise<void>;
  leaveChat: (shareCode: string) => void;
  renameChat: (chatId: string, newName: string) => Promise<void>;
  sendMessage: (text: string, fileUrl?: string | null, burnOnRead?: boolean) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const CryptoProvider = ({ children }: { children: ReactNode }) => {
  const [deviceId] = useState(() => {
    const existing = localStorage.getItem('axon_device_id');
    if (existing) return existing;
    const newId = 'anon_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('axon_device_id', newId);
    return newId;
  });

  const [savedCodes, setSavedCodes] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('axon_saved_chats') || '[]');
    } catch {
      return [];
    }
  });

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChatState] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<MessagePayload[]>([]);

  // Update local storage when savedCodes changes
  useEffect(() => {
    localStorage.setItem('axon_saved_chats', JSON.stringify(savedCodes));
  }, [savedCodes]);

  // Fetch chats on mount / when savedCodes changes
  useEffect(() => {
    if (!supabase || savedCodes.length === 0) {
      setChats([]);
      return;
    }
    const fetchChats = async () => {
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .in('share_code', savedCodes)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setChats(data);
        if (data.length > 0 && !activeChat) {
          setActiveChatState(data[0]);
        } else if (activeChat && !data.find(c => c.id === activeChat.id)) {
          setActiveChatState(data[0] || null);
        }
      }
    };
    fetchChats();
  }, [savedCodes]); // Removing activeChat from deps to avoid infinite loop

  const decryptText = useCallback((encrypted: string, key: string) => {
    if (!encrypted) return '';
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, key);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch {
      return '';
    }
  }, []);

  const encryptText = useCallback((raw: string, key: string) => {
    if (!raw) return '';
    return CryptoJS.AES.encrypt(raw, key).toString();
  }, []);

  // Fetch messages and subscribe to active chat
  useEffect(() => {
    if (!supabase || !activeChat) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', activeChat.id)
        .order('created_at', { ascending: true });

      if (!error && data) {
        const dec: MessagePayload[] = data.map(row => ({
          ...row,
          text: decryptText(row.text, activeChat.share_code),
          file_url: row.file_url ? decryptText(row.file_url, activeChat.share_code) : null,
        }));
        
        // Burn on refresh logic: Trigger delete for burned messages, but keep in local state
        const burnedMessages = dec.filter(m => m.burn_on_read && m.sender_id !== deviceId);
        for (const bm of burnedMessages) {
          supabase.from('messages').delete().eq('id', bm.id).then();
        }

        setMessages(dec);
      }
    };

    fetchMessages();

    const channel = supabase.channel(`chat:${activeChat.id}`);
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${activeChat.id}` },
      (payload) => {
        const row = payload.new as any;
        
        setMessages(prev => {
          if (prev.some(m => m.id === row.id)) return prev;
          const newMsg = {
            ...row,
            text: decryptText(row.text, activeChat.share_code),
            file_url: row.file_url ? decryptText(row.file_url, activeChat.share_code) : null,
          };

          // If it's a burned message received, trigger DB delete, keep locally
          if (newMsg.burn_on_read && newMsg.sender_id !== deviceId) {
            supabase.from('messages').delete().eq('id', newMsg.id).then();
          }

          return [...prev, newMsg];
        });
      }
    );

    channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages' },
      (payload) => {
        // We do NOT delete from local state if it's a burn_on_read message because we want it to stay until refresh
        // But for manual deletion, we should probably delete. 
        // For now, if a message is deleted from the DB, we can just leave it in local state if burn_on_read=true, 
        // else remove it.
        setMessages(prev => prev.filter(m => {
          if (m.id === payload.old.id) {
            return m.burn_on_read; // Keep if it was burn on read (we triggered the delete)
          }
          return true;
        }));
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat, deviceId, decryptText]);

  const setActiveChat = (chat: Chat) => {
    setActiveChatState(chat);
  };

  const createChat = async () => {
    if (!supabase) return;
    const shareCode = 'ax-' + Math.random().toString(36).substring(2, 10);
    const { data, error } = await supabase
      .from('chats')
      .insert({ name: 'New Chat', share_code: shareCode })
      .select()
      .single();

    if (!error && data) {
      setSavedCodes(prev => [...prev, shareCode]);
      setActiveChatState(data);
    }
  };

  const joinChat = async (shareCode: string) => {
    if (!supabase) return;
    const { data } = await supabase.from('chats').select('*').eq('share_code', shareCode).single();
    if (data && !savedCodes.includes(shareCode)) {
      setSavedCodes(prev => [...prev, shareCode]);
      setActiveChatState(data);
    }
  };

  const leaveChat = (shareCode: string) => {
    setSavedCodes(prev => prev.filter(c => c !== shareCode));
    if (activeChat?.share_code === shareCode) {
      setActiveChatState(null);
    }
  };

  const renameChat = async (chatId: string, newName: string) => {
    if (!supabase) return;
    await supabase.from('chats').update({ name: newName }).eq('id', chatId);
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, name: newName } : c));
    if (activeChat?.id === chatId) {
      setActiveChatState(prev => prev ? { ...prev, name: newName } : null);
    }
  };

  const sendMessage = async (text: string, fileUrl: string | null = null, burnOnRead: boolean = false) => {
    if (!supabase || !activeChat) return;

    const newId = crypto.randomUUID();
    const created_at = new Date().toISOString();
    
    const plainMsg: MessagePayload = {
      id: newId,
      chat_id: activeChat.id,
      sender_id: deviceId,
      text,
      file_url: fileUrl,
      burn_on_read: burnOnRead,
      created_at
    };

    setMessages(prev => [...prev, plainMsg]);

    await supabase.from('messages').insert({
      id: newId,
      chat_id: activeChat.id,
      sender_id: deviceId,
      text: encryptText(text, activeChat.share_code),
      file_url: fileUrl ? encryptText(fileUrl, activeChat.share_code) : null,
      burn_on_read: burnOnRead,
      created_at
    });
  };

  const deleteMessage = async (id: string) => {
    if (!supabase) return;
    setMessages(prev => prev.filter(m => m.id !== id));
    await supabase.from('messages').delete().eq('id', id);
  };

  return (
    <CryptoContext.Provider
      value={{
        deviceId,
        chats,
        activeChat,
        messages,
        setActiveChat,
        createChat,
        joinChat,
        leaveChat,
        renameChat,
        sendMessage,
        deleteMessage
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

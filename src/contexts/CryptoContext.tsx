import { createContext, useContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import CryptoJS from 'crypto-js';

export interface EphemeralMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isDecryptionError?: boolean;
}

interface CryptoContextType {
  alias: string;
  roomCode: string;
  messages: EphemeralMessage[];
  latency: number;
  login: (alias: string, roomCode: string) => void;
  logout: () => void;
  sendMessage: (text: string) => void;
  purgeTerminal: () => void;
  addSystemMessage: (text: string) => void;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const CryptoProvider = ({ children }: { children: ReactNode }) => {
  const [alias, setAlias] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [messages, setMessages] = useState<EphemeralMessage[]>([]);
  const [latency, setLatency] = useState(0);

  const login = (newAlias: string, newRoomCode: string) => {
    setAlias(newAlias);
    setRoomCode(newRoomCode);
    setMessages([]);
  };

  const logout = () => {
    setAlias('');
    setRoomCode('');
    setMessages([]);
  };

  const purgeTerminal = useCallback(() => {
    setMessages([]);
  }, []);

  const addSystemMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      sender: 'SYSTEM',
      text,
      timestamp: Date.now()
    }]);
  }, []);

  const decryptText = useCallback((encrypted: string, key: string) => {
    if (!encrypted) return '';
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, key);
      const text = bytes.toString(CryptoJS.enc.Utf8);
      return text; // Will be empty string if decryption fails due to wrong key
    } catch {
      return '';
    }
  }, []);

  const encryptText = useCallback((raw: string, key: string) => {
    if (!raw) return '';
    return CryptoJS.AES.encrypt(raw, key).toString();
  }, []);

  // Broadcast subscription
  useEffect(() => {
    if (!supabase || !roomCode) return;

    const channel = supabase.channel(`room:${roomCode}`);

    channel.on(
      'broadcast',
      { event: 'message' },
      (payload) => {
        const data = payload.payload;
        if (!data || !data.text) return;
        
        // Calculate latency
        const receivedTime = Date.now();
        setLatency(receivedTime - data.timestamp);

        const decrypted = decryptText(data.text, roomCode);
        
        const newMsg: EphemeralMessage = {
          id: crypto.randomUUID(),
          sender: data.sender,
          text: decrypted || '[DECRYPTION FAILED - INVALID KEY]',
          timestamp: data.timestamp,
          isDecryptionError: !decrypted
        };

        setMessages(prev => [...prev, newMsg]);
      }
    ).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode, decryptText]);

  const sendMessage = useCallback((text: string) => {
    if (!supabase || !roomCode || !alias) return;

    const encryptedText = encryptText(text, roomCode);
    const timestamp = Date.now();

    // Push local copy first for immediate feedback
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      sender: alias,
      text: text,
      timestamp
    }]);

    // Send broadcast
    const channel = supabase.channel(`room:${roomCode}`);
    channel.send({
      type: 'broadcast',
      event: 'message',
      payload: {
        sender: alias,
        text: encryptedText,
        timestamp
      }
    });
  }, [roomCode, alias, encryptText]);

  return (
    <CryptoContext.Provider
      value={{
        alias,
        roomCode,
        messages,
        latency,
        login,
        logout,
        sendMessage,
        purgeTerminal,
        addSystemMessage
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

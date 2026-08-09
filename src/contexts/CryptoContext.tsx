import { createContext, useContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import CryptoJS from 'crypto-js';

export interface MessagePayload {
  id: string;
  senderId: string;
  senderAlias: string;
  content: string; // The encrypted content over the wire, decrypted locally
  timestamp: number;
  type: 'message' | 'system' | 'error';
  isDecryptionError?: boolean;
}

interface CryptoContextType {
  nodeId: string;
  roomCode: string;
  setRoomCode: (code: string) => void;
  messages: MessagePayload[];
  sendMessage: (rawMessage: string) => void;
  clearMessages: () => void;
  injectSystemMessage: (content: string, type?: 'system' | 'error') => void;
  connected: boolean;
  activeNodes: number;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const CryptoProvider = ({ children }: { children: ReactNode }) => {
  const [nodeId] = useState(() => {
    const existing = sessionStorage.getItem('axon_node_id');
    if (existing) return existing;
    const newId = '0x' + Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
    sessionStorage.setItem('axon_node_id', newId);
    return newId;
  });

  const [roomCode, setRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'DEFAULT_SECURE_LINK';
  });

  const [messages, setMessages] = useState<MessagePayload[]>([]);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeNodes, setActiveNodes] = useState(1);

  const injectSystemMessage = useCallback((content: string, type: 'system' | 'error' = 'system') => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      senderId: 'SYSTEM',
      senderAlias: 'SYSADMIN',
      content,
      timestamp: Date.now(),
      type
    }]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  useEffect(() => {
    if (!supabase) {
      injectSystemMessage('CRITICAL: Supabase credentials missing. Offline mode active.', 'error');
      return;
    }

    const currentChannel = supabase.channel(`room:${roomCode}`, {
      config: {
        broadcast: { ack: false },
        presence: { key: nodeId },
      },
    });

    currentChannel
      .on('broadcast', { event: 'message' }, (payload) => {
        const { senderId, senderAlias, encryptedContent, timestamp } = payload.payload;
        
        let decryptedContent = '';
        let isDecryptionError = false;

        try {
          const bytes = CryptoJS.AES.decrypt(encryptedContent, roomCode);
          decryptedContent = bytes.toString(CryptoJS.enc.Utf8);
          if (!decryptedContent) {
            isDecryptionError = true;
          }
        } catch (err) {
          isDecryptionError = true;
        }

        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          senderId,
          senderAlias,
          content: isDecryptionError ? '[DECRYPTION FAILED - INVALID KEY]' : decryptedContent,
          timestamp,
          type: 'message',
          isDecryptionError
        }]);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = currentChannel.presenceState();
        setActiveNodes(Object.keys(state).length);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          currentChannel.track({ node_status: 'online' });
          injectSystemMessage(`Uplink established to [${roomCode}]. Channel secure.`);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConnected(false);
        }
      });

    setChannel(currentChannel);

    return () => {
      supabase.removeChannel(currentChannel);
    };
  }, [roomCode, nodeId, injectSystemMessage]);

  const sendMessage = useCallback((rawMessage: string) => {
    // Optimistic UI updates could happen here if we wanted, but we also want it to go through the wire
    // Or we just inject locally and broadcast
    const encryptedPayload = CryptoJS.AES.encrypt(rawMessage, roomCode).toString();
    
    // Inject locally immediately for better UX
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      senderId: nodeId,
      senderAlias: `NODE_${nodeId}`,
      content: rawMessage,
      timestamp: Date.now(),
      type: 'message'
    }]);

    if (channel && connected) {
      channel.send({
        type: 'broadcast',
        event: 'message',
        payload: {
          senderId: nodeId,
          senderAlias: `NODE_${nodeId}`,
          encryptedContent: encryptedPayload,
          timestamp: Date.now(),
        },
      });
    }
  }, [channel, connected, nodeId, roomCode]);

  return (
    <CryptoContext.Provider
      value={{
        nodeId,
        roomCode,
        setRoomCode,
        messages,
        sendMessage,
        clearMessages,
        injectSystemMessage,
        connected,
        activeNodes
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

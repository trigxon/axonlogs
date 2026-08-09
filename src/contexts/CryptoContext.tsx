import { createContext, useContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import CryptoJS from 'crypto-js';

export interface MessagePayload {
  id: string;
  senderId: string;
  senderAlias: string;
  content: string;
  timestamp: number;
  type: 'message' | 'system' | 'error';
  isDecryptionError?: boolean;
}

interface CryptoContextType {
  nodeId: string;
  roomCode: string;
  username: string;
  messages: MessagePayload[];
  sendMessage: (rawMessage: string) => void;
  clearMessages: () => void;
  injectSystemMessage: (content: string, type?: 'system' | 'error') => void;
  connected: boolean;
  activeNodes: number;
  connectToRoom: (user: string, room: string) => void;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

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

  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [shouldConnect, setShouldConnect] = useState(false);

  const [messages, setMessages] = useState<MessagePayload[]>([]);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [localChannel, setLocalChannel] = useState<BroadcastChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeNodes, setActiveNodes] = useState(1);
  const [knownNodes, setKnownNodes] = useState<Set<string>>(new Set([nodeId]));

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

  const connectToRoom = useCallback((user: string, room: string) => {
    setUsername(user);
    setRoomCode(room);
    setShouldConnect(true);
  }, []);

  // BroadcastChannel Fallback Logic
  useEffect(() => {
    if (!shouldConnect || supabase) return; 

    const bc = new BroadcastChannel(`axon_room_${roomCode}`);
    setLocalChannel(bc);
    setConnected(true);

    const handleMessage = (event: MessageEvent) => {
      const payload = event.data;

      if (payload.type === 'ping') {
        setKnownNodes(prev => new Set([...prev, payload.nodeId]));
        bc.postMessage({ type: 'pong', nodeId });
        return;
      }
      if (payload.type === 'pong') {
        setKnownNodes(prev => new Set([...prev, payload.nodeId]));
        return;
      }

      if (payload.type === 'message') {
        const { senderId, senderAlias, encryptedContent, timestamp } = payload;
        
        let decryptedContent = '';
        let isDecryptionError = false;

        try {
          const bytes = CryptoJS.AES.decrypt(encryptedContent, roomCode);
          decryptedContent = bytes.toString(CryptoJS.enc.Utf8);
          if (!decryptedContent) isDecryptionError = true;
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
      }
    };

    bc.addEventListener('message', handleMessage);
    
    // Announce presence
    bc.postMessage({ type: 'ping', nodeId });
    injectSystemMessage(`[LOCAL MODE ACTIVE] Uplink established to [${roomCode}]. Channel secure.`);

    return () => {
      bc.removeEventListener('message', handleMessage);
      bc.close();
    };
  }, [shouldConnect, roomCode, nodeId, injectSystemMessage]);

  // Update active nodes count for local mode
  useEffect(() => {
    if (!supabase) {
      setActiveNodes(knownNodes.size);
    }
  }, [knownNodes]);


  // Supabase Logic
  useEffect(() => {
    if (!shouldConnect || !supabase) return;

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
          if (!decryptedContent) isDecryptionError = true;
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
  }, [shouldConnect, roomCode, nodeId, injectSystemMessage]);

  const sendMessage = useCallback((rawMessage: string) => {
    if (!shouldConnect) return;

    const encryptedPayload = CryptoJS.AES.encrypt(rawMessage, roomCode).toString();
    
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      senderId: nodeId,
      senderAlias: username,
      content: rawMessage,
      timestamp: Date.now(),
      type: 'message'
    }]);

    if (supabase && channel && connected) {
      channel.send({
        type: 'broadcast',
        event: 'message',
        payload: {
          senderId: nodeId,
          senderAlias: username,
          encryptedContent: encryptedPayload,
          timestamp: Date.now(),
        },
      });
    } else if (!supabase && localChannel) {
      localChannel.postMessage({
        type: 'message',
        senderId: nodeId,
        senderAlias: username,
        encryptedContent: encryptedPayload,
        timestamp: Date.now(),
      });
    }
  }, [shouldConnect, channel, localChannel, connected, nodeId, roomCode, username]);

  return (
    <CryptoContext.Provider
      value={{
        nodeId,
        roomCode,
        username,
        messages,
        sendMessage,
        clearMessages,
        injectSystemMessage,
        connected,
        activeNodes,
        connectToRoom
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

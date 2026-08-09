import { useEffect, useRef } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';
import MessageBubble from './MessageBubble';
import { ShieldCheck } from 'lucide-react';

const ChatFeed = () => {
  const { messages, roomCode, connected } = useCrypto();
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic anchored to bottom
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Chat Header */}
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#050505]/80 backdrop-blur-sm z-10 shrink-0">
        <div>
          <div className="font-bold tracking-wider mb-1">
            CHANNEL // [{roomCode}]
          </div>
          {connected ? (
            <div className="text-matrix text-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-matrix animate-pulse" />
              Uplink Established
            </div>
          ) : (
            <div className="text-alert text-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-alert" />
              Uplink Disconnected
            </div>
          )}
        </div>

        <div className="border border-matrix/50 text-matrix px-3 py-1 rounded text-xs md:text-sm font-bold flex items-center gap-2 shadow-[0_0_10px_rgba(0,255,65,0.2)]">
          <ShieldCheck className="w-4 h-4" />
          E2EE LIVE
        </div>
      </div>

      {/* Message Feed */}
      <div 
        ref={feedRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 pb-10"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-gray/50 space-y-4 select-none">
            <ShieldCheck className="w-12 h-12 opacity-20" />
            <p className="text-sm">AWAITING SECURE TRANSMISSIONS</p>
            <p className="text-xs">--- 256-BIT AES ENCRYPTION ACTIVE ---</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatFeed;

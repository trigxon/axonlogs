import { useEffect, useRef } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';
import { useSettings } from '../../contexts/SettingsContext';
import MessageBubble from './MessageBubble';
import { Flame } from 'lucide-react';
import { cn } from '../../lib/utils';

const ChatFeed = () => {
  const { messages, activeChat, deviceId } = useCrypto();
  const { burnerMode, setBurnerMode } = useSettings();
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  if (!activeChat) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-background">
      {/* Chat Header */}
      <div className="h-14 px-4 border-b border-border flex justify-between items-center bg-panel/95 backdrop-blur z-10 shrink-0">
        <div className="font-semibold text-[15px]">
          {activeChat.name}
        </div>

        <button 
          onClick={() => setBurnerMode(!burnerMode)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
            burnerMode 
              ? "bg-danger/20 text-danger border border-danger/30" 
              : "bg-white/5 text-text-secondary hover:bg-white/10"
          )}
          title="Toggle Burner Mode"
        >
          <Flame className="w-3.5 h-3.5" />
          Burner {burnerMode ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Message Feed */}
      <div 
        ref={feedRef}
        className="flex-1 overflow-y-auto p-4 space-y-2"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-secondary/40 space-y-3 select-none">
            <MessageBubble message={{
              id: 'placeholder',
              chat_id: activeChat.id,
              sender_id: 'system',
              text: 'This is the start of your secure chat.',
              file_url: null,
              burn_on_read: false,
              created_at: new Date().toISOString()
            }} isOwn={false} />
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} isOwn={msg.sender_id === deviceId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatFeed;

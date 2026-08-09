import React from 'react';
import { ShieldAlert } from 'lucide-react';
import type { MessagePayload } from '../../contexts/CryptoContext';
import { useSettings } from '../../contexts/SettingsContext';
import { cn } from '../../lib/utils';
import FileViewer from './FileViewer';

interface MessageBubbleProps {
  message: MessagePayload;
  isOwn: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isOwn }) => {
  const { stealthMode } = useSettings();
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={cn(
      "group flex flex-col w-full max-w-[85%] sm:max-w-[75%] font-chat transition-all",
      isOwn ? "ml-auto items-end" : "mr-auto items-start"
    )}>
      <div 
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          "px-4 py-3 rounded-2xl md:rounded-3xl shadow-sm",
          isOwn 
            ? "bg-accent text-white rounded-br-sm" 
            : "bg-panel border border-border text-text-primary rounded-bl-sm",
          stealthMode && "blur-sm hover:blur-none cursor-pointer"
        )}
      >
        {/* Burn indicator (if it's not our own message and it was a burn message) */}
        {message.burn_on_read && !isOwn && (
          <div className="absolute top-0 right-0 p-1.5 opacity-50" title="This message will burn on refresh">
            <ShieldAlert className="w-3 h-3 text-red-500" />
          </div>
        )}

        {message.isDecryptionError ? (
          <div className="text-danger text-sm flex items-center gap-2 font-medium">
            <ShieldAlert className="w-4 h-4" />
            <span className="italic">Decryption failed</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {message.file_url && (
              (() => {
                try {
                  const p = JSON.parse(message.file_url);
                  return <FileViewer url={p.url} filename={p.name} mimeType={p.mimeType} />;
                } catch {
                  // Fallback if it's just a raw URL
                  return <FileViewer url={message.file_url} filename="Attachment" mimeType="application/octet-stream" />;
                }
              })()
            )}
            {message.text && (
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                {message.text}
              </p>
            )}
          </div>
        )}
      </div>
      <div className={cn(
        "text-[11px] font-medium text-text-secondary mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity px-1",
        isOwn ? "text-right" : "text-left"
      )}>
        {time} {message.burn_on_read && isOwn && " • Burns on Read"}
      </div>
    </div>
  );
};

export default MessageBubble;

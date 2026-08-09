import { format } from 'date-fns';
import { useCrypto, type MessagePayload } from '../../contexts/CryptoContext';
import { useSettings } from '../../contexts/SettingsContext';
import { cn } from '../../lib/utils';
import { Trash2, Flame } from 'lucide-react';
import FileViewer from './FileViewer';

const MessageBubble = ({ msg }: { msg: MessagePayload }) => {
  const { deviceId, deleteMessage } = useCrypto();
  const { stealthMode } = useSettings();
  const isSelf = msg.sender_id === deviceId;

  const timeString = format(new Date(msg.created_at), 'HH:mm');

  let filePayload = null;
  if (msg.file_url) {
    try {
      filePayload = JSON.parse(msg.file_url);
    } catch {
      filePayload = { url: msg.file_url, name: 'Attachment', mimeType: 'application/octet-stream' };
    }
  }

  return (
    <div className={cn("flex flex-col mb-4 group", isSelf ? "items-end" : "items-start")}>
      <div 
        className={cn(
          "max-w-[75%] px-4 py-3 break-words shadow-sm transition-all duration-300",
          isSelf 
            ? "bg-accent/20 border border-accent/40 text-accent rounded-sm rounded-br-none" 
            : "bg-panel border border-border text-text-primary rounded-sm rounded-bl-none",
          stealthMode ? "blur-sm hover:blur-none" : ""
        )}
      >
        {filePayload && (
          <div className="mb-2">
            <FileViewer url={filePayload.url} filename={filePayload.name} mimeType={filePayload.mimeType} />
          </div>
        )}
        {msg.text && <p className="whitespace-pre-wrap leading-relaxed font-chat text-[0.95rem]">{msg.text}</p>}
        
        <div className={cn(
          "flex items-center gap-1.5 mt-2 text-[0.7em] font-mono tracking-widest",
          isSelf ? "text-accent/70 justify-end" : "text-text-secondary justify-start"
        )}>
          {msg.burn_on_read && (
            <span title="Burns on refresh">
              <Flame className="w-3 h-3 text-danger" />
            </span>
          )}
          <span>{timeString}</span>
        </div>
      </div>
      
      {isSelf && (
        <button 
          onClick={() => deleteMessage(msg.id)} 
          className="opacity-0 group-hover:opacity-100 transition-opacity text-text-secondary hover:text-danger mt-1 mr-1 p-1"
          title="Unsend"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default MessageBubble;

import { format } from 'date-fns';
import { useCrypto, type MessagePayload } from '../../contexts/CryptoContext';
import { cn } from '../../lib/utils';
import { Trash2, Flame } from 'lucide-react';
import FileViewer from './FileViewer';

const MessageBubble = ({ msg }: { msg: MessagePayload }) => {
  const { deviceId, deleteMessage } = useCrypto();
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
          "max-w-[75%] px-4 py-2.5 break-words shadow-sm",
          isSelf 
            ? "bg-accent/90 text-white" 
            : "bg-panel border border-border text-text-primary"
        )}
        style={{
          borderTopLeftRadius: 'var(--radius)',
          borderTopRightRadius: 'var(--radius)',
          borderBottomLeftRadius: isSelf ? 'var(--radius)' : '0px',
          borderBottomRightRadius: isSelf ? '0px' : 'var(--radius)',
        }}
      >
        {filePayload && (
          <div className="mb-2">
            <FileViewer url={filePayload.url} filename={filePayload.name} mimeType={filePayload.mimeType} />
          </div>
        )}
        {msg.text && <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>}
        
        <div className={cn(
          "flex items-center gap-1.5 mt-1 text-[0.8em]",
          isSelf ? "text-white/70 justify-end" : "text-text-secondary justify-start"
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

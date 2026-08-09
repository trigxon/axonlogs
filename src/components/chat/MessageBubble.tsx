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
      <div className={cn(
        "relative max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed shadow-sm",
        isSelf 
          ? "bg-accent text-white rounded-br-sm" 
          : "bg-transparent border border-border text-text-primary rounded-bl-sm"
      )}>
        {filePayload ? (
          <FileViewer url={filePayload.url} filename={filePayload.name} mimeType={filePayload.mimeType} />
        ) : null}
        
        {msg.text && (
          <div className="whitespace-pre-wrap break-words">{msg.text}</div>
        )}

        <div className={cn(
          "flex items-center gap-1.5 mt-1 text-[11px]",
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

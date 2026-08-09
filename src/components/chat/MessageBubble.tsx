import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useCrypto, type MessagePayload } from '../../contexts/CryptoContext';
import { useSettings } from '../../contexts/SettingsContext';
import { cn } from '../../lib/utils';
import { Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MessageBubble = ({ msg }: { msg: MessagePayload }) => {
  const { nodeId } = useCrypto();
  const { stealthMode, burnOnRead, timeFormat } = useSettings();
  const [timeLeft, setTimeLeft] = useState(10);
  const [isBurned, setIsBurned] = useState(false);

  const isSelf = msg.senderId === nodeId;
  const isSystem = msg.type === 'system';
  const isError = msg.type === 'error' || msg.isDecryptionError;

  // Burn on read timer
  useEffect(() => {
    if (!burnOnRead || isSystem || isError) return;
    
    if (timeLeft <= 0) {
      setIsBurned(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [burnOnRead, timeLeft, isSystem, isError]);

  if (isBurned) return null;

  const timeString = timeFormat === 'UTC' 
    ? format(new Date(msg.timestamp), 'HH:mm:ss') + ' UTC' 
    : format(new Date(msg.timestamp), 'HH:mm:ss');

  if (isSystem || isError) {
    return (
      <div className={cn(
        "my-4 p-4 border",
        isError ? "border-alert text-alert/90" : "border-matrix text-matrix/90",
        "bg-black/40 text-xs md:text-sm font-mono flex flex-col gap-2 relative"
      )}>
        <div className="flex justify-between items-center opacity-70 mb-2">
          <span>{msg.senderAlias}</span>
          <span>{timeString}</span>
        </div>
        <div className={cn(stealthMode && "blur-[4px] hover:blur-none transition-all duration-300")}>
          {msg.content}
        </div>
      </div>
    );
  }

  // Handle file attachments implicitly (base64 image detection)
  const isImage = msg.content.startsWith('data:image/');

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn("flex flex-col mb-6 max-w-[85%]", isSelf ? "self-end items-end" : "self-start items-start")}
      >
        <div className="flex items-center gap-4 mb-2 text-xs text-muted-gray">
          {isSelf ? (
            <>
              <span>{timeString}</span>
              <span className="text-cyan-neon font-bold">{msg.senderAlias}</span>
            </>
          ) : (
            <>
              <span className="text-matrix font-bold">{msg.senderAlias}</span>
              <span>{timeString}</span>
            </>
          )}
        </div>

        <div className={cn(
          "relative p-4 border bg-black/60 shadow-lg text-sm md:text-base",
          isSelf ? "border-cyan-neon text-cyan-neon/90" : "border-white/20 text-white/90",
          stealthMode && "blur-[5px] hover:blur-none transition-all duration-300 cursor-crosshair"
        )}>
          {isImage ? (
            <div className="flex items-center gap-4 p-2 bg-white/5 rounded">
              <img src={msg.content} alt="Encrypted Attachment" className="max-w-[200px] max-h-[200px] object-cover rounded" />
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-white/70">SECURE_PAYLOAD.bin</span>
                <span className="text-muted-gray">PGP Locked</span>
                <button className="mt-2 text-cyan-neon hover:text-white transition-colors self-start">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <span className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</span>
          )}

          {/* Burn Timer Badge */}
          {burnOnRead && (
            <div className="absolute -bottom-3 -right-2 bg-void border border-alert text-alert text-[10px] px-1.5 py-0.5 rounded font-bold animate-pulse">
              T-{timeLeft}s
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MessageBubble;

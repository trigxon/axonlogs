import { useState, useRef, useEffect } from 'react';
import { Paperclip, Send, Smile } from 'lucide-react';
import { useCrypto, supabase } from '../../contexts/CryptoContext';
import { useSettings } from '../../contexts/SettingsContext';
import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react';
import { cn } from '../../lib/utils';
import { AnimatePresence } from 'framer-motion';

const ChatInput = () => {
  const [input, setInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const { sendMessage, activeChat } = useCrypto();
  const { burnerMode, enterToSend } = useSettings();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Click outside to close emoji picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !activeChat) return;
    const text = input.trim();
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
    await sendMessage(text, null, burnerMode);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (enterToSend) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setInput(prev => prev + emojiData.emoji);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !supabase || !activeChat) return;

    setIsUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (file.size > 1024 * 1024 * 50) { // Limit to 50MB
          console.error('File too large');
          continue;
        }

        const fileExt = file.name.split('.').pop();
        const filePath = `${activeChat.id}/${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage.from('axon_files').upload(filePath, file);
        if (uploadError) throw uploadError;
        
        const { data } = supabase.storage.from('axon_files').getPublicUrl(filePath);
        
        // Instead of JSON, we can just pass the URL since our DB schema has file_url and text.
        // For a file upload, we might want to also send the file name if we want to display it.
        // For simplicity, we can format file_url as JSON if needed, or just send the URL and infer name from it.
        // The prompt says: If .jpg etc... If .zip etc... 
        // Our FileViewer uses URL to infer. But to display file name, we need it.
        // Let's store a JSON in file_url column to hold both url and name, OR we can just use the url and get the name from the path.
        // Let's store JSON string in file_url: { url, name, mimeType }
        const filePayload = JSON.stringify({
          url: data.publicUrl,
          name: file.name,
          mimeType: file.type || 'application/octet-stream'
        });

        await sendMessage('', filePayload, burnerMode);
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="p-3 bg-background border-t border-border shrink-0 relative">
      {/* Emoji Picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <div ref={pickerRef} className="absolute bottom-full mb-2 right-4 z-50 shadow-2xl rounded-xl overflow-hidden border border-border">
            <EmojiPicker 
              theme={Theme.DARK}
              onEmojiClick={onEmojiClick}
              autoFocusSearch={false}
              skinTonesDisabled
            />
          </div>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-2 bg-panel border border-border rounded-sm p-1.5 focus-within:border-accent transition-colors shadow-sm max-w-4xl mx-auto">
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileUpload}
          accept="*"
          multiple
          className="hidden" 
        />
        
        <button 
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-sm transition-colors flex-shrink-0"
          title="Attach Files"
          disabled={isUploading}
        >
          <Paperclip className={cn("w-5 h-5", isUploading && "animate-pulse text-accent")} />
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          className="flex-1 max-h-[120px] bg-transparent border-none outline-none text-text-primary placeholder:text-text-secondary/70 resize-none py-2.5 px-1 text-[15px] leading-relaxed font-chat"
          rows={1}
        />

        <div className="flex items-center gap-1 shrink-0 pb-1 pr-1">
          <button 
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-sm transition-colors"
          >
            <Smile className="w-5 h-5" />
          </button>
          
          <button 
            onClick={handleSend}
            disabled={!input.trim() && !isUploading}
            className="p-2 bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:hover:bg-accent"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

      </div>
    </div>
  );
};

export default ChatInput;

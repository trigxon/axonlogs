import { useState, useRef } from 'react';
import { Paperclip, Play } from 'lucide-react';
import { useCrypto } from '../../contexts/CryptoContext';
import { useSettings } from '../../contexts/SettingsContext';

const CommandInput = () => {
  const [input, setInput] = useState('');
  const { sendMessage, clearMessages, injectSystemMessage } = useCrypto();
  const { setPanicState } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Handle Slash Commands
    if (input.startsWith('/')) {
      const command = input.trim().toLowerCase();
      if (command === '/clear') {
        clearMessages();
      } else if (command === '/ping') {
        const start = Date.now();
        // Simulate a tiny delay for "ping" effect, though technically we can just output it
        setTimeout(() => {
          injectSystemMessage(`PONG. Round-trip latency: ${Date.now() - start + Math.floor(Math.random() * 20)}ms`);
        }, 50);
      } else if (command === '/panic') {
        setPanicState(true);
      } else {
        injectSystemMessage(`COMMAND NOT FOUND: ${command}`, 'error');
      }
      setInput('');
      return;
    }

    // Send normal message
    sendMessage(input);
    setInput('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert image to base64 for encryption (Note: Realtime limits payload size, keep images small)
    if (file.size > 1024 * 500) { // Limit to 500kb for Supabase Realtime safety
      injectSystemMessage('FILE TOO LARGE. Max size 500KB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      if (base64String) {
        sendMessage(base64String);
      }
    };
    reader.readAsDataURL(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-3 md:p-4 bg-[#0a0a0f] border-t border-white/10 shrink-0">
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 text-matrix text-sm whitespace-nowrap">
          <span className="font-bold">_&gt;</span>
          <span>COMMAND_PROMPT</span>
          <span className="text-white/50">root@axon:~$</span>
        </div>
        <div className="md:hidden text-matrix font-bold">_&gt;</div>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter command or message..."
          className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-muted-gray focus:ring-0 text-sm md:text-base selection:bg-cyan-neon/30"
          autoFocus
        />

        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden" 
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-muted-gray hover:text-white transition-colors"
            title="Attach File (Max 500KB)"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          
          <button 
            type="submit"
            className="bg-cyan-neon text-void px-4 py-2 rounded font-bold flex items-center gap-2 hover:bg-cyan-neon/80 hover:shadow-[0_0_15px_rgba(0,229,255,0.4)] transition-all"
          >
            <span className="hidden sm:inline">EXECUTE</span>
            <Play className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default CommandInput;

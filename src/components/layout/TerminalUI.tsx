import React, { useState, useRef, useEffect } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';
import { Terminal, Shield, Wifi, Skull, EyeOff, Power } from 'lucide-react';

const TerminalUI: React.FC = () => {
  const { alias, roomCode, messages, latency, sendMessage, purgeTerminal, logout, addSystemMessage } = useCrypto();
  const [input, setInput] = useState('');
  const [panicMode, setPanicMode] = useState(false);
  const [stealthMode, setStealthMode] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const cmd = input.trim();
    setInput('');

    // Slash command interpreter
    if (cmd === '/clear') {
      purgeTerminal();
      return;
    }
    
    if (cmd === '/ping') {
      addSystemMessage('Latency calculating...');
      return;
    }

    if (cmd === '/panic') {
      setPanicMode(true);
      return;
    }

    // Normal message broadcast
    sendMessage(cmd);
  };

  if (panicMode) {
    return (
      <div className="min-h-screen w-full bg-white flex items-center justify-center cursor-default selection:bg-transparent">
        <h1 className="text-4xl font-sans font-bold text-black">404 - Server Not Found</h1>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-[#10b981] flex flex-col font-mono">
      {/* Top Bar */}
      <header className="h-12 border-b border-[#10b981]/30 bg-[#0a0a0f] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4 text-xs font-bold tracking-widest">
          <span className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            AXON // {roomCode}
          </span>
          <span className="hidden md:flex items-center gap-2 text-[#059669]">
            <Shield className="w-3 h-3" />
            E2EE ACTIVE
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-[#059669]">
            <Wifi className="w-3 h-3" />
            LATENCY: {latency > 0 ? `${latency}ms` : '---'}
          </div>

          <button 
            onClick={() => setStealthMode(!stealthMode)}
            className={`text-xs px-2 py-1 border border-[#10b981]/30 flex items-center gap-2 transition-colors ${stealthMode ? 'bg-[#10b981]/20 text-[#10b981]' : 'text-[#059669] hover:bg-[#10b981]/10'}`}
          >
            <EyeOff className="w-3 h-3" />
            STEALTH
          </button>

          <button 
            onClick={purgeTerminal}
            className="text-xs px-2 py-1 border border-red-500/30 text-red-500 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
          >
            <Skull className="w-3 h-3" />
            PURGE
          </button>
          
          <button 
            onClick={logout}
            className="p-1.5 border border-[#10b981]/30 text-[#059669] hover:bg-[#10b981]/10 hover:text-[#10b981] transition-colors"
            title="Disconnect"
          >
            <Power className="w-3 h-3" />
          </button>
        </div>
      </header>

      {/* Feed */}
      <main ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="text-[#059669] opacity-50 text-sm">
            [SYSTEM: CHANNEL SECURE. AWAITING TRANSMISSIONS...]
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className="text-sm">
              <span className="text-[#059669]">
                [{new Date(msg.timestamp).toLocaleTimeString()}] 
              </span>
              {' '}
              <span className={`font-bold ${msg.sender === alias ? 'text-[#34d399]' : 'text-white'}`}>
                &lt;{msg.sender}&gt;
              </span>
              {' '}
              {msg.isDecryptionError ? (
                <span className="bg-red-500 text-white px-1 ml-2 font-bold tracking-widest">[DECRYPTION FAILED - INVALID KEY]</span>
              ) : (
                <span className={`ml-2 break-words ${stealthMode ? 'filter blur-sm hover:blur-none transition-all cursor-crosshair' : ''}`}>
                  {msg.text}
                </span>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="p-4 border-t border-[#10b981]/30 bg-[#0a0a0f] shrink-0">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <span className="text-[#059669] font-bold shrink-0">{alias} ~ %</span>
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-[#10b981] font-mono placeholder:text-[#10b981]/20"
            placeholder="Enter command or message..."
            autoFocus
            autoComplete="off"
            spellCheck="false"
          />
          <button 
            type="submit"
            className="text-xs px-4 py-2 border border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/10 transition-colors font-bold tracking-widest shrink-0"
          >
            EXECUTE
          </button>
        </form>
      </footer>
    </div>
  );
};

export default TerminalUI;

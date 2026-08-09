import React, { useState, useRef, useEffect } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';
import { Network, Server, Shield, Power, Settings, FileText, ToggleRight, ToggleLeft, Key, Terminal, ArrowRight, Download, EyeOff } from 'lucide-react';

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
    <div className="flex h-[100dvh] w-full bg-[#050505] text-[#a3a3a3] font-mono overflow-hidden">
      
      {/* LEFT SIDEBAR */}
      <aside className="w-[260px] flex-shrink-0 border-r border-zinc-900 flex flex-col bg-[#080808]">
        {/* Branding */}
        <div className="p-6 pb-4">
          <h1 className="text-cyan-400 font-bold text-lg tracking-wider mb-2">AXON_ROOT</h1>
          <div className="flex items-center gap-2 text-xs mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>NODE: 0x0F2A</span>
          </div>
          <div className="inline-block border border-cyan-400/50 text-cyan-400 text-[10px] px-2 py-0.5 font-bold tracking-widest uppercase">
            [SYSADMIN]
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-cyan-400 bg-cyan-400/5 text-sm border-l-2 border-cyan-400 transition-colors">
            <Network className="w-4 h-4" />
            Channels
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 text-sm transition-colors border-l-2 border-transparent">
            <Server className="w-4 h-4" />
            Nodes
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 text-sm transition-colors border-l-2 border-transparent">
            <Shield className="w-4 h-4" />
            Security
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 text-sm transition-colors border-l-2 border-transparent">
            <Power className="w-4 h-4" />
            Session
          </button>
        </nav>

        {/* Controls */}
        <div className="px-4 py-4 border-t border-zinc-900 space-y-4">
          <button className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 transition-colors uppercase tracking-widest">
            <span>Invite Node</span>
            <span className="text-zinc-600">G</span>
          </button>
          
          <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <EyeOff className="w-3 h-3" />
              Stealth Mode
            </span>
            <button onClick={() => setStealthMode(!stealthMode)} className="text-zinc-500 hover:text-cyan-400 transition-colors">
              {stealthMode ? <ToggleRight className="w-5 h-5 text-cyan-400" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Footer Nav */}
        <div className="px-4 py-4 space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 text-sm transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 text-sm transition-colors">
            <FileText className="w-4 h-4" />
            Logs
          </button>
        </div>

        {/* Terminate Session Button */}
        <div className="p-4 pt-2 mt-auto">
          <button 
            onClick={logout}
            className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs uppercase tracking-[0.2em] py-3 transition-colors"
          >
            TERMINATE SESSION
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#050505]">
        
        {/* Top Header */}
        <header className="h-14 border-b border-zinc-900 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-6 text-[10px] font-bold tracking-widest uppercase">
            <span className="text-cyan-400">AXON_NETWORK</span>
            <span className="text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors">STATION_ALPHA</span>
            <span className="text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors">STATION_BETA</span>
          </div>

          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest font-bold">
            <div className="border border-emerald-500/30 text-emerald-500 px-3 py-1 flex items-center gap-2">
              LATENCY: {latency > 0 ? `${latency}MS` : '---'}
            </div>
            <div className="border border-emerald-500/30 text-emerald-500 px-3 py-1 flex items-center gap-2">
              AES-256 ACTIVE
            </div>
            <button 
              onClick={purgeTerminal}
              className="border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 px-3 py-1 transition-colors"
            >
              PURGE TERMINAL
            </button>
            <div className="flex items-center gap-2 text-zinc-500 ml-2">
              <Key className="w-4 h-4" />
            </div>
          </div>
        </header>

        {/* Sub Header */}
        <div className="px-8 pt-8 pb-4 shrink-0">
          <h2 className="text-white font-bold text-lg tracking-widest uppercase mb-1">
            CHANNEL // [{roomCode}]
          </h2>
          <div className="text-emerald-500 text-xs">Uplink Established</div>
        </div>

        {/* Chat Feed */}
        <div ref={feedRef} className="flex-1 overflow-y-auto px-8 py-4 flex flex-col gap-6">
          
          {messages.length === 0 ? (
            <div className="text-zinc-600 text-sm mt-4">
              [SYSTEM: CHANNEL SECURE. AWAITING TRANSMISSIONS...]
            </div>
          ) : (
            messages.map(msg => {
              const isSelf = msg.sender === alias;
              const isSystem = msg.sender === 'SYSTEM';

              if (isSystem) {
                return (
                  <div key={msg.id} className="text-zinc-500 text-xs text-center border-y border-zinc-900 py-2 my-2">
                    {msg.text}
                  </div>
                );
              }

              return (
                <div 
                  key={msg.id} 
                  className={`flex flex-col w-full max-w-3xl border border-zinc-800 p-4 relative ${
                    isSelf 
                      ? 'ml-auto border-cyan-400/50 bg-cyan-950/10' 
                      : 'border-l-2 border-emerald-500/50 bg-[#080808]'
                  }`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isSelf ? 'text-cyan-400' : 'text-emerald-500'}`}>
                      {msg.sender}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, timeZone: 'UTC' })} UTC
                    </span>
                  </div>
                  
                  {msg.isDecryptionError ? (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-2 text-xs uppercase tracking-widest font-bold">
                      [DECRYPTION FAILED - INVALID KEY]
                    </div>
                  ) : (
                    <div className={`text-sm text-zinc-300 leading-relaxed ${stealthMode ? 'filter blur-sm hover:blur-none transition-all cursor-crosshair' : ''}`}>
                      {msg.text}
                    </div>
                  )}
                </div>
              );
            })
          )}
          
          {/* Dummy File Block for styling example (Optional/Hidden for now) */}
          <div className="hidden border border-emerald-500/30 p-4 max-w-sm flex items-center justify-between bg-[#080808]">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-emerald-500" />
              <div className="flex flex-col">
                <span className="text-white text-xs">payload_manifest.enc</span>
                <span className="text-zinc-500 text-[10px]">1.2 MB // PGP Locked</span>
              </div>
            </div>
            <button className="text-emerald-500 hover:text-emerald-400">
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <footer className="shrink-0 p-4 bg-[#050505]">
          <form 
            onSubmit={handleSubmit} 
            className="flex items-center gap-4 bg-[#0a0a0f] border border-zinc-800 focus-within:border-cyan-400/50 transition-colors p-2"
          >
            <div className="flex items-center gap-2 pl-2 text-emerald-500 text-xs whitespace-nowrap">
              <Terminal className="w-4 h-4" />
              <span>COMMAND_PROMPT root@axon:~$</span>
            </div>
            
            <input 
              type="text" 
              value={input}
              onChange={e => setInput(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-zinc-200 font-mono text-sm placeholder:text-zinc-700"
              placeholder="Enter command or message..."
              autoFocus
              autoComplete="off"
              spellCheck="false"
            />
            
            <button 
              type="submit"
              className="bg-cyan-400 hover:bg-cyan-300 text-black px-6 py-2 text-xs font-bold tracking-widest flex items-center gap-2 transition-colors uppercase"
            >
              EXECUTE
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </footer>

      </main>
    </div>
  );
};

export default TerminalUI;

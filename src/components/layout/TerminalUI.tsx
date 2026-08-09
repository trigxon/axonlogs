import React, { useState, useRef, useEffect } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';
import { Settings, FileText, ToggleRight, ToggleLeft, Key, Terminal, ArrowRight, Download, EyeOff, Paperclip, Plus, KeyRound } from 'lucide-react';

const TerminalUI: React.FC = () => {
  const { deviceId, alias, chats, activeChat, messages, latency, setActiveChat, createChat, joinChat, sendMessage, purgeTerminal, addSystemMessage } = useCrypto();
  const [input, setInput] = useState('');
  const [panicMode, setPanicMode] = useState(false);
  const [stealthMode, setStealthMode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  
  const feedRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !fileInputRef.current?.files?.[0]) return;

    const cmd = input.trim();
    const file = fileInputRef.current?.files?.[0];
    
    setInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Slash command interpreter (only if text command)
    if (cmd === '/clear' && !file) {
      purgeTerminal();
      return;
    }
    if (cmd === '/ping' && !file) {
      addSystemMessage('Latency calculating...');
      return;
    }
    if (cmd === '/panic' && !file) {
      setPanicMode(true);
      return;
    }

    await sendMessage(cmd, file);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    const success = await joinChat(joinCode.trim().toUpperCase());
    if (success) {
      setJoinCode('');
      setIsJoining(false);
    } else {
      alert("Invalid code or chat not found.");
    }
  };

  const renderFile = (fileUrlStr: string | null) => {
    if (!fileUrlStr) return null;
    try {
      const file = JSON.parse(fileUrlStr);
      return (
        <div className="mt-2 border border-emerald-500/30 p-3 max-w-sm flex items-center justify-between bg-[#080808]">
          <div className="flex items-center gap-3 overflow-hidden">
            <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="flex flex-col overflow-hidden">
              <span className="text-white text-xs truncate" title={file.name}>{file.name}</span>
              <span className="text-zinc-500 text-[10px]">{(file.size / 1024 / 1024).toFixed(2)} MB // PGP Locked</span>
            </div>
          </div>
          <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 p-2 shrink-0">
            <Download className="w-4 h-4" />
          </a>
        </div>
      );
    } catch {
      return null;
    }
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
            <span>NODE: {deviceId.substring(0,6).toUpperCase()}</span>
          </div>
          <div className="inline-block border border-cyan-400/50 text-cyan-400 text-[10px] px-2 py-0.5 font-bold tracking-widest uppercase">
            [SYSADMIN]
          </div>
        </div>

        {/* Dynamic Chats List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          <div className="text-xs font-bold tracking-widest text-zinc-500 mb-3 px-2">CHANNELS</div>
          {chats.map(chat => (
            <button 
              key={chat.id}
              onClick={() => setActiveChat(chat)}
              className={`w-full flex flex-col items-start px-3 py-2 text-sm transition-colors border-l-2 ${
                activeChat?.id === chat.id 
                  ? 'text-cyan-400 bg-cyan-400/5 border-cyan-400' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border-transparent'
              }`}
            >
              <div className="truncate w-full text-left">{chat.name}</div>
              <div className="text-[10px] opacity-60 font-mono tracking-widest mt-0.5">{chat.share_code}</div>
            </button>
          ))}
        </div>

        {/* Chat Actions */}
        <div className="px-4 py-4 border-t border-zinc-900 space-y-3">
          {isJoining ? (
            <form onSubmit={handleJoinSubmit} className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                placeholder="LINK CODE"
                className="w-full bg-[#050505] border border-zinc-700 text-xs px-2 py-1.5 focus:border-cyan-400 outline-none text-white uppercase placeholder:text-zinc-700"
                autoFocus
              />
              <button type="button" onClick={() => setIsJoining(false)} className="text-xs text-zinc-500 hover:text-white px-1">X</button>
            </form>
          ) : (
            <>
              <button onClick={() => setIsJoining(true)} className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-cyan-400 transition-colors uppercase tracking-widest border border-zinc-800 hover:border-cyan-400/30 p-2">
                <span className="flex items-center gap-2"><KeyRound className="w-3 h-3" /> Join Link</span>
              </button>
              <button onClick={createChat} className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-emerald-400 transition-colors uppercase tracking-widest border border-zinc-800 hover:border-emerald-500/30 p-2">
                <span className="flex items-center gap-2"><Plus className="w-3 h-3" /> Create Tunnel</span>
              </button>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-4 border-t border-zinc-900 space-y-4">
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

        {/* Terminate Session Button (No-op in anonymous mode, maybe just resets) */}
        <div className="p-4 pt-2 mt-auto">
          <button 
            onClick={() => localStorage.clear()}
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
          <div className="flex items-center gap-6 text-[10px] font-bold tracking-widest uppercase overflow-hidden">
            <span className="text-cyan-400 shrink-0">AXON_NETWORK</span>
            <span className="text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors truncate">STATION_ALPHA</span>
            <span className="text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors truncate hidden md:inline">STATION_BETA</span>
          </div>

          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest font-bold shrink-0">
            <div className="border border-emerald-500/30 text-emerald-500 px-3 py-1 items-center gap-2 hidden sm:flex">
              LATENCY: {latency > 0 ? `${latency}MS` : '---'}
            </div>
            <div className="border border-emerald-500/30 text-emerald-500 px-3 py-1 items-center gap-2 hidden md:flex">
              AES-256 ACTIVE
            </div>
            <button 
              onClick={purgeTerminal}
              className="border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 px-3 py-1 transition-colors"
            >
              PURGE TERMINAL
            </button>
            <div className="flex items-center gap-2 text-zinc-500 ml-2 hidden sm:flex">
              <Key className="w-4 h-4" />
            </div>
          </div>
        </header>

        {/* Sub Header */}
        <div className="px-8 pt-8 pb-4 shrink-0">
          <h2 className="text-white font-bold text-lg tracking-widest uppercase mb-1 flex items-center gap-3">
            CHANNEL // [{activeChat?.share_code || 'STANDBY'}]
          </h2>
          <div className="text-emerald-500 text-xs">{activeChat ? 'Uplink Established' : 'Awaiting Connection...'}</div>
        </div>

        {/* Chat Feed */}
        <div ref={feedRef} className="flex-1 overflow-y-auto px-8 py-4 flex flex-col gap-6">
          
          {!activeChat ? (
            <div className="text-zinc-600 text-sm mt-4">
              [SYSTEM: NO CHANNEL SELECTED. CREATE OR JOIN TO INITIATE.]
            </div>
          ) : messages.length === 0 ? (
            <div className="text-zinc-600 text-sm mt-4">
              [SYSTEM: CHANNEL SECURE. AWAITING TRANSMISSIONS...]
            </div>
          ) : (
            messages.map(msg => {
              const isSelf = msg.sender_id === deviceId;
              const isSystem = msg.sender_id === 'SYSTEM';

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
                  className={`flex flex-col w-full max-w-3xl border p-4 relative ${
                    isSelf 
                      ? 'ml-auto border-cyan-400/50 bg-cyan-950/10' 
                      : 'border-zinc-800 border-l-2 border-l-emerald-500/50 bg-[#080808]'
                  }`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isSelf ? 'text-cyan-400' : 'text-emerald-500'}`}>
                      {isSelf ? alias : `NODE_${msg.sender_id.substring(0,4)}`}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour12: false, timeZone: 'UTC' })} UTC
                    </span>
                  </div>
                  
                  {msg.isDecryptionError ? (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-2 text-xs uppercase tracking-widest font-bold">
                      [DECRYPTION FAILED - INVALID KEY]
                    </div>
                  ) : (
                    <>
                      {msg.text && (
                        <div className={`text-sm text-zinc-300 leading-relaxed ${stealthMode ? 'filter blur-sm hover:blur-none transition-all cursor-crosshair' : ''}`}>
                          {msg.text}
                        </div>
                      )}
                      {renderFile(msg.file_url)}
                    </>
                  )}
                </div>
              );
            })
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        {activeChat && (
          <footer className="shrink-0 p-4 bg-[#050505]">
            <form 
              onSubmit={handleSubmit} 
              className="flex items-center gap-2 sm:gap-4 bg-[#0a0a0f] border border-zinc-800 focus-within:border-cyan-400/50 transition-colors p-2"
            >
              <div className="hidden sm:flex items-center gap-2 pl-2 text-emerald-500 text-xs whitespace-nowrap">
                <Terminal className="w-4 h-4" />
                <span>COMMAND_PROMPT root@axon:~$</span>
              </div>
              
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-zinc-200 font-mono text-sm placeholder:text-zinc-700 min-w-0 px-2"
                placeholder="Enter command or message..."
                autoFocus
                autoComplete="off"
                spellCheck="false"
              />

              {/* No strict `accept` constraints here, letting mobile natively browse all files */}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={() => setInput(prev => prev ? prev : fileInputRef.current?.files?.[0]?.name || '')}
              />
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-zinc-500 hover:text-emerald-400 transition-colors shrink-0"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              
              <button 
                type="submit"
                className="bg-cyan-400 hover:bg-cyan-300 text-black px-4 sm:px-6 py-2 text-xs font-bold tracking-widest flex items-center gap-2 transition-colors uppercase shrink-0"
              >
                <span className="hidden sm:inline">EXECUTE</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </footer>
        )}

      </main>
    </div>
  );
};

export default TerminalUI;

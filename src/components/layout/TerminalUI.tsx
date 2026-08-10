import React, { useState, useRef, useEffect } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';
import { Settings, FileText, ToggleRight, ToggleLeft, Terminal, ArrowRight, Download, EyeOff, Paperclip, Plus, KeyRound, X, Edit2, Server, Key, Reply, Square, Lock, Search, Video } from 'lucide-react';
import { encodeSteganography, decodeSteganography } from '../../utils/steg';
import * as webllm from '@mlc-ai/web-llm';
import ReactMarkdown from 'react-markdown';
import { VideoTunnel } from './VideoTunnel';
import { VoiceRecorder } from '../chat/VoiceRecorder';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const CodeBlock = ({ inline, className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const codeString = String(children).replace(/\n$/, '');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div className="relative mt-2 mb-4 group font-mono">
        <div className="flex justify-between items-center bg-[#1e1e1e] px-4 py-1 border border-zinc-800 border-b-0">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{match[1]}</span>
          <button 
            onClick={handleCopy}
            className="text-[10px] text-cyan-500 hover:text-cyan-400 uppercase tracking-widest font-bold"
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          className="border border-zinc-800 !m-0 !bg-[#0a0a0f] text-xs"
          {...props}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  }
  return (
    <code className="bg-zinc-800 text-cyan-300 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
      {children}
    </code>
  );
};

const TerminalUI: React.FC = () => {
  const { deviceId, alias, chats, activeChat, messages, latency, setActiveChat, createChat, joinChat, sendMessage, purgeTerminal, addSystemMessage, updateAlias, systemLogs, networkStatus, renameChat, archiveChat, deleteChat, changeChatPassword, onlineUsers, typingUsers, broadcastTyping } = useCrypto();
  const [input, setInput] = useState('');
  const [panicMode, setPanicMode] = useState(false);
  const [stealthMode, setStealthMode] = useState(false);
  const [isDecoyMode, setIsDecoyMode] = useState(false);
  const [decoyPassphrase, setDecoyPassphrase] = useState(() => localStorage.getItem('axon_decoy_pass') || 'DECOY123');
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showVideoTunnel, setShowVideoTunnel] = useState(false);

  const [isIdleLocked, setIsIdleLocked] = useState(false);
  const idleTimeoutRef = useRef<any>(null);
  const [keystrokeTimings, setKeystrokeTimings] = useState<number[]>([]);
  const lastKeyTimeRef = useRef<number>(0);

  const [useSteganography, setUseSteganography] = useState(false);
  const [decodedStego, setDecodedStego] = useState<Record<string, string>>({});

  const [aiEngine, setAiEngine] = useState<webllm.MLCEngine | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [aliasInput, setAliasInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatPassphrase, setNewChatPassphrase] = useState('');
  const [isEphemeralChat, setIsEphemeralChat] = useState(false);

  const [replyToId, setReplyToId] = useState<string | null>(null);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, chatId: string } | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [targetChatId, setTargetChatId] = useState<string | null>(null);

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTargetId, setUnlockTargetId] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    setAliasInput(alias);
  }, [alias]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Idle Timer
  useEffect(() => {
    const resetIdle = () => {
      if (isIdleLocked) return;
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => {
        setIsIdleLocked(true);
      }, 60000); // 60s idle
    };
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [isIdleLocked]);

  // AI Initialization
  const initAI = async () => {
    if (aiEngine) return;
    setIsAiLoading(true);
    addSystemMessage('[SYSTEM: INITIALIZING LOCAL WEBGPU AI NODE... THIS MAY TAKE A MOMENT TO CACHE THE MODEL]');
    try {
      const engine = new webllm.MLCEngine();
      await engine.reload("Llama-3-8B-Instruct-q4f32_1-MLC");
      setAiEngine(engine);
      addSystemMessage('[SYSTEM: @AxonNode ONLINE. LOCAL AI IS READY.]');
    } catch (e) {
      console.error(e);
      addSystemMessage('[SYSTEM: ERROR STARTING AI. WEBGPU MIGHT NOT BE SUPPORTED.]');
    }
    setIsAiLoading(false);
  };

  // Click away for context menu
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !selectedFile) return;

    if (input.trim() === '/nuke' && activeChat) {
      if (confirm("WARNING: NUCLEAR PROTOCOL INITIATED. THIS WILL PERMANENTLY DESTROY THIS TERMINAL AND ALL DATA GLOBALLY. PROCEED?")) {
        deleteChat(activeChat.id);
        setInput('');
        return;
      }
    }

    const cmd = input.trim();
    const file = selectedFile;
    
    setInput('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      broadcastTyping(false);
    }

    // Slash command interpreter (only if text command)
    if (cmd === '/clear' && !file) {
      purgeTerminal();
      return;
    }
    if (cmd === '/ping' && !file) {
      addSystemMessage(`PING: WebSocket Latency ${latency}ms`);
      return;
    }
    if (cmd === '/panic' && !file) {
      setPanicMode(true);
      return;
    }

    let finalFile = file;
    if (file && useSteganography && file.type.startsWith('image/')) {
      const stegoMessage = prompt("Enter secret message to embed via Steganography:");
      if (stegoMessage) {
        try {
          finalFile = await encodeSteganography(file, stegoMessage);
          addSystemMessage('[STEG: PAYLOAD EMBEDDED IN LSB]');
        } catch (e) {
          alert('Steganography encoding failed');
        }
      }
    }

    await sendMessage(cmd, finalFile, replyToId);
    setReplyToId(null);
    setUseSteganography(false);

    // AI Trigger
    if (cmd.includes('@AxonNode')) {
      if (!aiEngine && !isAiLoading) {
        initAI().then(async () => {
          // Send prompt after init
          const reply = await generateAIResponse(cmd);
          sendMessage(`[AxonNode]: ${reply}`);
        });
      } else if (aiEngine) {
        generateAIResponse(cmd).then(reply => {
          sendMessage(`[AxonNode]: ${reply}`);
        });
      }
    }
  };

  const generateAIResponse = async (prompt: string) => {
    if (!aiEngine) return "ERROR: AI offline.";
    addSystemMessage('[AxonNode is thinking...]');
    try {
      const messages: webllm.ChatCompletionMessageParam[] = [{ role: 'user', content: prompt }];
      const reply = await aiEngine.chat.completions.create({ messages });
      return reply.choices[0].message.content || 'NO RESPONSE';
    } catch (e) {
      return "ERROR: AI generation failed.";
    }
  };



  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (!typingTimeoutRef.current) {
      broadcastTyping(true);
    } else {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(false);
      typingTimeoutRef.current = null;
    }, 2000);
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

  const decodeImage = async (id: string, url: string) => {
    try {
      const msg = await decodeSteganography(url);
      setDecodedStego(prev => ({ ...prev, [id]: msg }));
    } catch (e) {
      setDecodedStego(prev => ({ ...prev, [id]: '[NO HIDDEN PAYLOAD]' }));
    }
  };

  const renderFile = (msgId: string, fileUrl: string | null) => {
    if (!fileUrl) return null;
    
    const isImage = fileUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i);
    const isAudio = fileUrl.match(/\.(webm|mp3|ogg|wav)(\?.*)?$/i);

    if (isAudio) {
      return (
        <div className="mt-4 p-2 bg-black/40 border border-zinc-800 rounded">
          <audio controls src={fileUrl} className="w-full h-8" />
        </div>
      );
    }
    
    if (isImage) {
      return (
        <div className="mt-2 group relative">
          <img src={fileUrl} alt="Secure Upload" className="max-w-full rounded border border-zinc-800 max-h-64 object-contain bg-black/50" />
          <button 
            onClick={() => decodeImage(msgId, fileUrl)}
            className="absolute top-2 right-2 bg-black/80 p-1 text-xs text-cyan-400 border border-cyan-400/30 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Extract Steg
          </button>
          {decodedStego[msgId] && (
            <div className="mt-2 p-2 bg-indigo-950/40 border border-indigo-500/50 text-indigo-300 text-xs font-mono">
              [STEG DECODED]: {decodedStego[msgId]}
            </div>
          )}
        </div>
      );
    }

    try {
      const file = JSON.parse(fileUrl);
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

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateAlias(aliasInput);
    setShowSettings(false);
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newChatPassphrase.trim().length < 4) {
      alert("Passphrase must be at least 4 characters.");
      return;
    }
    const success = await createChat(newChatName, newChatPassphrase, isEphemeralChat);
    if (success) {
      setShowCreateModal(false);
      setNewChatName('');
      setNewChatPassphrase('');
      setIsEphemeralChat(false);
    }
  };

  const handleRenameChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = targetChatId || activeChat?.id;
    if (id && renameInput.trim()) {
      await renameChat(id, renameInput.trim());
      setShowRenameModal(false);
    }
  };

  const handlePasswordKeyDown = () => {
    const now = Date.now();
    if (lastKeyTimeRef.current > 0) {
      setKeystrokeTimings(prev => [...prev, now - lastKeyTimeRef.current]);
    }
    lastKeyTimeRef.current = now;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetChatId && passwordInput.trim()) {
      await changeChatPassword(targetChatId, passwordInput.trim().toUpperCase());
      setShowPasswordModal(false);
    }
  };

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Keystroke Dynamics Analysis
    const avgKeystroke = keystrokeTimings.length > 0 
      ? keystrokeTimings.reduce((a,b)=>a+b, 0) / keystrokeTimings.length 
      : 0;
    
    const baseline = Number(localStorage.getItem('axon_keystroke_baseline'));
    
    if (!baseline && avgKeystroke > 0) {
      localStorage.setItem('axon_keystroke_baseline', avgKeystroke.toString());
    } else if (baseline > 0 && avgKeystroke > 0) {
      const diff = Math.abs(avgKeystroke - baseline) / baseline;
      if (diff > 0.4) {
        // High deviation -> divert to decoy
        setIsDecoyMode(true);
        setShowUnlockModal(false);
        setKeystrokeTimings([]);
        return;
      }
    }
    setKeystrokeTimings([]);

    if (unlockPassword.trim() === decoyPassphrase) {
      setIsDecoyMode(true);
      setShowUnlockModal(false);
      return;
    }
    const chat = chats.find(c => c.id === unlockTargetId);
    if (chat && unlockPassword.trim().toUpperCase() === chat.share_code) {
      setActiveChat(chat);
      setShowUnlockModal(false);
    } else {
      setUnlockError(true);
    }
  };

  if (panicMode) {
    return (
      <div className="h-[100dvh] w-full bg-white text-black flex flex-col items-center justify-center font-sans">
        <h1 className="text-4xl font-bold mb-2">404 Not Found</h1>
        <p className="text-gray-600">The requested URL was not found on this server.</p>
        <button className="mt-8 text-sm text-blue-600 underline" onClick={() => setPanicMode(false)}>Return Home</button>
      </div>
    );
  }

  if (isDecoyMode) {
    return (
      <div className="flex flex-col h-[100dvh] w-full bg-white text-black font-sans p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full">
          <div className="flex justify-between items-center mb-6 border-b pb-4">
            <h1 className="text-3xl font-bold">Biology 101 Notes</h1>
            <button onClick={() => setIsDecoyMode(false)} className="text-gray-400 hover:text-black transition-colors">Exit</button>
          </div>
          <div className="space-y-4 text-gray-800">
            <h2 className="text-xl font-semibold">1. Mitosis Overview</h2>
            <p>Mitosis is a part of the cell cycle in which replicated chromosomes are separated into two new nuclei.</p>
            <p>Cell division gives rise to genetically identical cells in which the total number of chromosomes is maintained.</p>
            <h2 className="text-xl font-semibold mt-6">2. Phases of Mitosis</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Prophase:</strong> Chromatin condenses into chromosomes.</li>
              <li><strong>Metaphase:</strong> Chromosomes align at the metaphase plate.</li>
              <li><strong>Anaphase:</strong> Sister chromatids separate to opposite poles.</li>
              <li><strong>Telophase:</strong> Nuclear envelope reforms.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (isIdleLocked) {
    return (
      <div className="h-[100dvh] w-full bg-[#050505] text-[#a3a3a3] flex flex-col items-center justify-center font-mono relative overflow-hidden backdrop-blur-3xl">
        <div className="absolute inset-0 bg-black/60 z-10"></div>
        <div className="z-20 flex flex-col items-center">
          <Lock className="w-16 h-16 text-cyan-500 mb-6" />
          <h1 className="text-2xl font-bold tracking-widest text-cyan-400 mb-4 uppercase">BIOMETRIC LOCK ENGAGED</h1>
          <p className="text-zinc-500 text-sm mb-8 text-center max-w-md">Idle limit exceeded. Terminal locked to prevent unauthorized physical access.</p>
          <button 
            onClick={() => setIsIdleLocked(false)}
            className="px-8 py-3 bg-cyan-400/10 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black transition-all uppercase tracking-widest font-bold"
          >
            Re-Authenticate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-[100dvh] w-full bg-[#050505] text-[#a3a3a3] font-mono overflow-hidden relative ${isIdleLocked ? 'blur-xl' : ''}`}>
      
      {/* WATERMARK */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.02] flex flex-wrap gap-4 z-50 select-none items-center justify-center">
        {Array.from({length: 150}).map((_, i) => (
          <span key={i} className="text-white text-xs font-mono font-bold whitespace-nowrap">
            {deviceId}::{alias}
          </span>
        ))}
      </div>
      
      {/* LEFT SIDEBAR */}
      <aside className="w-[260px] flex-shrink-0 border-r border-zinc-900 flex flex-col bg-[#080808]">
        {/* Branding */}
        <div className="p-6 pb-4">
          <h1 className="text-cyan-400 font-bold text-lg tracking-wider mb-2">AXON_ROOT</h1>
          <div className="flex items-center gap-2 text-xs mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>NODE: {deviceId.substring(0,6).toUpperCase()}</span>
          </div>
        </div>

        {/* Dynamic Chats List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          <div className="text-xs font-bold tracking-widest text-zinc-500 mb-3 px-2 flex justify-between items-center">
            TERMINALS
          </div>
          <div className="px-2 mb-4">
            <div className="flex items-center gap-2 bg-[#050505] border border-zinc-800 px-2 py-1 focus-within:border-cyan-400/50">
              <Search className="w-3 h-3 text-zinc-500" />
              <input 
                type="text" 
                placeholder="LOCAL SEARCH..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-[10px] text-zinc-300 w-full placeholder:text-zinc-700 uppercase"
              />
            </div>
          </div>
          {chats.map(chat => (
            <button 
              key={chat.id}
              onClick={() => {
                if (activeChat?.id === chat.id) return;
                setUnlockTargetId(chat.id);
                setUnlockPassword('');
                setUnlockError(false);
                setShowUnlockModal(true);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.pageX, y: e.pageY, chatId: chat.id });
              }}
              className={`w-full flex flex-col items-start px-3 py-2 text-sm transition-colors border-l-2 ${
                activeChat?.id === chat.id 
                  ? 'text-cyan-400 bg-cyan-400/5 border-cyan-400' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border-transparent'
              }`}
            >
              <div className="truncate w-full text-left">{chat.name}</div>
              <div className="text-[10px] opacity-60 font-mono tracking-widest mt-0.5">
                {activeChat?.id === chat.id ? '*** UNLOCKED ***' : '*** LOCKED ***'}
              </div>
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
              <button onClick={() => setShowCreateModal(true)} className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-emerald-400 transition-colors uppercase tracking-widest border border-zinc-800 hover:border-emerald-500/30 p-2">
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
          <button onClick={() => setShowSettings(true)} className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 text-sm transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button onClick={() => setShowLogs(true)} className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 text-sm transition-colors">
            <FileText className="w-4 h-4" />
            Logs
          </button>
        </div>

        {/* Terminate Session Button */}
        <div className="p-4 pt-2 mt-auto">
          <button 
            onClick={() => { localStorage.clear(); window.location.reload(); }}
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
            <button onClick={() => setShowSettings(true)} className="text-zinc-300 hover:text-cyan-400 cursor-pointer transition-colors truncate">
              ALIAS: {alias}
            </button>
          </div>

          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest font-bold shrink-0">
            {latency > 0 && (
              <div className="border border-emerald-500/30 text-emerald-500 px-3 py-1 items-center gap-2 hidden sm:flex">
                LATENCY: {latency}MS
              </div>
            )}
            <div className={`border px-3 py-1 items-center gap-2 hidden md:flex ${networkStatus === 'ONLINE' ? 'border-emerald-500/30 text-emerald-500' : 'border-red-500/30 text-red-500'}`}>
              NETWORK: {networkStatus}
            </div>
            {activeChat && (
              <button 
                onClick={() => setShowVideoTunnel(!showVideoTunnel)}
                className={`border px-3 py-1 items-center gap-2 hidden md:flex transition-colors ${showVideoTunnel ? 'bg-cyan-500 text-black border-cyan-500' : 'border-cyan-500/30 text-cyan-500 hover:bg-cyan-500 hover:text-black'}`}
              >
                <Video size={12} className="inline mr-1" /> COMM-LINK
              </button>
            )}
            <button 
              onClick={purgeTerminal}
              className="border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 px-3 py-1 transition-colors"
            >
              PURGE TERMINAL
            </button>
          </div>
        </header>

        {/* Sub Header */}
        <div className="px-8 pt-8 pb-4 shrink-0">
          <h2 className="text-white font-bold text-lg tracking-widest uppercase mb-1 flex items-center gap-3">
            TERMINAL // [{activeChat?.share_code || 'STANDBY'}]
            {activeChat?.share_code.startsWith('EPH-') && (
              <span className="text-[10px] bg-red-500/20 text-red-500 px-2 py-0.5 border border-red-500/30 font-bold tracking-[0.2em] animate-pulse">
                EPHEMERAL
              </span>
            )}
            {activeChat && (
              <button 
                onClick={() => {
                  setTargetChatId(activeChat.id);
                  setRenameInput(activeChat.name);
                  setShowRenameModal(true);
                }}
                className="text-zinc-600 hover:text-cyan-400 transition-colors ml-2"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </h2>
          <div className="text-emerald-500 text-xs mt-1">
            {activeChat ? 'Uplink Established' : 'Awaiting Connection...'}
            {activeChat && Object.keys(onlineUsers).length > 0 && (
              <span className="ml-4 text-cyan-400">
                ACTIVE NODES: {Object.values(onlineUsers).join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Chat Feed */}
        <div 
          ref={feedRef} 
          className="flex-1 overflow-y-auto px-8 py-4 flex flex-col gap-6 relative"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='300' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Ctext x='50%25' y='50%25' font-size='14' font-family='monospace' fill='%23ffffff' fill-opacity='0.02' text-anchor='middle' transform='rotate(-45 150 100)'%3EAXON NODE: ${alias} | ${deviceId.substring(0,8)}%3C/text%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat'
          }}
        >
          
          {showVideoTunnel && activeChat && (
            <VideoTunnel onClose={() => setShowVideoTunnel(false)} />
          )}

          {!activeChat ? (
            <div className="text-zinc-600 text-sm mt-4">
              [SYSTEM: NO CHANNEL SELECTED. CREATE OR JOIN TO INITIATE.]
            </div>
          ) : messages.length === 0 ? (
            <div className="text-zinc-600 text-sm mt-4">
              [SYSTEM: CHANNEL SECURE. AWAITING TRANSMISSIONS...]
            </div>
          ) : (
            messages
              .filter(msg => !searchQuery || (msg.text && msg.text.toLowerCase().includes(searchQuery.toLowerCase())))
              .map(msg => {
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
                  id={`msg-${msg.id}`}
                  className={`flex flex-col w-full max-w-3xl border p-4 relative group ${
                    isSelf 
                      ? 'ml-auto border-cyan-400/50 bg-cyan-950/10' 
                      : 'border-zinc-800 border-l-2 border-l-emerald-500/50 bg-[#080808]'
                  }`}
                >
                  <button 
                    onClick={() => setReplyToId(msg.id)}
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-cyan-400 transition-opacity bg-black/50 p-1 rounded"
                    title="Reply to message"
                  >
                    <Reply size={14} />
                  </button>
                  <div className="flex justify-between items-center mb-3 pr-8">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isSelf ? 'text-cyan-400' : 'text-emerald-500'}`}>
                      {isSelf ? alias : `NODE_${msg.sender_id.substring(0,4)}`}
                    </span>
                    <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour12: false, timeZone: 'UTC' })} UTC
                      {isSelf && (
                        <span className={msg.read_by && msg.read_by.length > 0 ? 'text-cyan-500' : 'text-zinc-600'}>
                          {msg.read_by && msg.read_by.length > 0 ? '✓✓' : '✓'}
                        </span>
                      )}
                    </span>
                  </div>
                  
                  {msg.reply_to_id && (
                    <div 
                      className="mb-2 p-2 bg-black/20 border-l-2 border-zinc-700 text-xs text-zinc-500 truncate cursor-pointer hover:bg-black/40 transition-colors"
                      onClick={() => {
                        const el = document.getElementById(`msg-${msg.reply_to_id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      {messages.find(m => m.id === msg.reply_to_id)?.text || 'Audio / Attachment'}
                    </div>
                  )}

                  {msg.isDecryptionError ? (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-2 text-xs uppercase tracking-widest font-bold">
                      [DECRYPTION FAILED - INVALID KEY]
                    </div>
                  ) : (
                    <>
                      {msg.text && (
                        <div className={`text-sm text-zinc-300 leading-relaxed ${stealthMode ? 'filter blur-sm hover:blur-none transition-all cursor-crosshair' : ''}`}>
                          <div className="break-words space-y-2">
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]} 
                              components={{
                                code: CodeBlock,
                                p({children}) { return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p> },
                                a({href, children}) { return <a href={href} className="text-cyan-500 hover:underline" target="_blank">{children}</a> },
                                ul({children}) { return <ul className="list-disc pl-4 mb-2">{children}</ul> },
                                ol({children}) { return <ol className="list-decimal pl-4 mb-2">{children}</ol> },
                                li({children}) { return <li className="mb-1">{children}</li> },
                                blockquote({children}) { return <blockquote className="border-l-2 border-zinc-700 pl-3 italic text-zinc-400">{children}</blockquote> }
                              }}
                            >
                              {msg.text}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                      {renderFile(msg.id, msg.file_url)}
                    </>
                  )}
                </div>
              );
            })
          )}

          {Object.keys(typingUsers).filter(id => id !== deviceId).length > 0 && (
            <div className="text-[10px] text-cyan-500/70 font-mono tracking-widest uppercase mb-4 animate-pulse">
              [{Object.values(typingUsers).filter((_, i) => Object.keys(typingUsers)[i] !== deviceId).join(', ')} IS TYPING...]
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        {activeChat && (
          <footer className="shrink-0 p-4 bg-[#050505]">
            {replyToId && (
              <div className="mb-2 p-2 bg-zinc-900 border-l-2 border-cyan-500 text-xs text-zinc-400 flex justify-between items-center max-w-full">
                <span className="truncate">REPLYING TO: {messages.find(m => m.id === replyToId)?.text || 'AUDIO / ATTACHMENT'}</span>
                <button onClick={() => setReplyToId(null)} className="text-zinc-500 hover:text-white p-1">
                  <X size={14} />
                </button>
              </div>
            )}
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
                onChange={handleInputChange}
                className="flex-1 bg-transparent border-none outline-none text-zinc-200 font-mono text-sm placeholder:text-zinc-700 min-w-0 px-2"
                placeholder="Enter command or message..."
                autoFocus
                autoComplete="off"
                spellCheck="false"
              />

              {/* Attachment Preview */}
              {selectedFile && (
                <div className="absolute bottom-full left-0 mb-2 ml-4 flex items-center gap-3 bg-[#0a0a0f] border border-cyan-400/30 px-3 py-2">
                  <Paperclip className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-zinc-300 truncate max-w-[200px]">{selectedFile.name}</span>
                  {selectedFile.type.startsWith('image/') && (
                    <label className="flex items-center gap-2 ml-4 border-l border-zinc-800 pl-4 cursor-pointer text-xs">
                      <input 
                        type="checkbox" 
                        checked={useSteganography} 
                        onChange={e => setUseSteganography(e.target.checked)}
                        className="accent-cyan-400"
                      />
                      <span className="text-zinc-400 uppercase tracking-widest">Lsb Steg</span>
                    </label>
                  )}
                  <button type="button" onClick={() => { setSelectedFile(null); setUseSteganography(false); }} className="text-zinc-500 hover:text-red-500 ml-2">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* No strict `accept` constraints here, letting mobile natively browse all files */}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
              />
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-zinc-500 hover:text-emerald-400 transition-colors shrink-0"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              
              <VoiceRecorder 
                onRecordingComplete={(base64Audio) => {
                  if (activeChat && base64Audio) {
                    sendMessage(activeChat.id, '', base64Audio, replyToId || undefined);
                    setReplyToId(null);
                  }
                }} 
              />
              
              <button 
                type="submit"
                disabled={(!input.trim() && !selectedFile)}
                className="bg-cyan-400 hover:bg-cyan-300 text-black px-4 sm:px-6 py-2 text-xs font-bold tracking-widest flex items-center gap-2 transition-colors uppercase shrink-0"
              >
                <span className="hidden sm:inline">EXECUTE</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </footer>
        )}

      </main>

      {/* MODALS */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#0a0a0f] border border-zinc-800 w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-[#050505]">
              <div className="font-bold tracking-widest text-zinc-300 flex items-center gap-2">
                <Settings className="w-5 h-5" /> SYSTEM CONFIGURATION
              </div>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Appearance */}
              <div className="border-l-4 border-l-pink-500 bg-[#050505] p-4 border border-zinc-800/50">
                <h3 className="text-pink-500 font-bold mb-4 tracking-widest text-sm uppercase">Appearance & Identity</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">STATION ALIAS</label>
                    <input 
                      type="text" 
                      value={aliasInput}
                      onChange={e => setAliasInput(e.target.value)}
                      className="w-full bg-[#0a0a0f] border border-zinc-800 focus:border-pink-500 p-2 text-white font-mono text-sm outline-none uppercase"
                    />
                  </div>
                  <button onClick={handleSaveSettings} className="bg-pink-500 hover:bg-pink-400 text-black py-1.5 px-4 text-xs font-bold tracking-widest uppercase transition-colors">
                    UPDATE ALIAS
                  </button>
                </div>
              </div>

              {/* Privacy */}
              <div className="border-l-4 border-l-blue-500 bg-[#050505] p-4 border border-zinc-800/50">
                <h3 className="text-blue-500 font-bold mb-4 tracking-widest text-sm uppercase">Privacy & Threat Mitigation</h3>
                <div className="space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={stealthMode} onChange={e => setStealthMode(e.target.checked)} className="hidden" />
                    {stealthMode ? <ToggleRight className="text-blue-400 w-6 h-6" /> : <ToggleLeft className="text-zinc-600 w-6 h-6" />}
                    <span className="text-sm">Stealth Mode (Blur feed on idle/hover)</span>
                  </label>
                  <div>
                    <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">DECOY VAULT PASSPHRASE</label>
                    <input 
                      type="text" 
                      value={decoyPassphrase}
                      onChange={e => {
                        setDecoyPassphrase(e.target.value); 
                        localStorage.setItem('axon_decoy_pass', e.target.value);
                      }}
                      className="w-full bg-[#0a0a0f] border border-zinc-800 focus:border-blue-500 p-2 text-white font-mono text-sm outline-none uppercase"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">Entering this passphrase during unlock will trigger plausible deniability mode.</p>
                  </div>
                </div>
              </div>

              {/* System Control */}
              <div className="border-l-4 border-l-purple-500 bg-[#050505] p-4 border border-zinc-800/50">
                <h3 className="text-purple-500 font-bold mb-4 tracking-widest text-sm uppercase">System Control</h3>
                <div className="space-y-2">
                  <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">DEVICE IDENTIFIER (WATERMARK ID)</label>
                  <div className="w-full bg-[#0a0a0f] border border-zinc-800 p-2 text-zinc-600 font-mono text-xs select-all">
                    {deviceId}
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="border-l-4 border-l-red-500 bg-[#050505] p-4 border border-zinc-800/50">
                <h3 className="text-red-500 font-bold mb-4 tracking-widest text-sm uppercase">Danger Zone</h3>
                <div className="space-y-4">
                  <p className="text-xs text-zinc-500">Executing a Nuclear Purge will destroy the entire terminal globally. Do not run this lightly.</p>
                  <button 
                    onClick={() => {
                      if (activeChat && confirm("WARNING: NUCLEAR PROTOCOL INITIATED. THIS WILL PERMANENTLY DESTROY THIS TERMINAL AND ALL DATA GLOBALLY. PROCEED?")) {
                        deleteChat(activeChat.id);
                        setShowSettings(false);
                      }
                    }}
                    disabled={!activeChat}
                    className="w-full bg-red-500/10 border border-red-500/50 hover:bg-red-500 hover:text-black text-red-500 py-1.5 px-4 text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-50"
                  >
                    NUCLEAR PURGE ACTIVE TERMINAL
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#050505] border border-emerald-500/50 w-full max-w-2xl h-[60vh] flex flex-col relative">
            <button onClick={() => setShowLogs(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <div className="p-4 border-b border-zinc-900 shrink-0">
              <h3 className="text-emerald-500 font-bold tracking-widest uppercase flex items-center gap-2">
                <FileText className="w-5 h-5" /> EVENT LOGS
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {systemLogs.length === 0 ? (
                <div className="text-zinc-600 text-xs">[NO LOGS AVAILABLE]</div>
              ) : (
                systemLogs.map(log => (
                  <div key={log.id} className="text-xs font-mono text-zinc-400 border-l-2 border-zinc-800 pl-3 py-1">
                    <span className="text-emerald-500 mr-2">[{new Date(log.time).toLocaleTimeString()}]</span>
                    {log.msg}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#050505] border border-emerald-500/50 w-full max-w-md p-6 relative">
            <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-emerald-500 font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
              <Server className="w-5 h-5" /> INITIALIZE NEW TUNNEL
            </h3>
            
            <form onSubmit={handleCreateChat} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">TUNNEL NAME (OPTIONAL)</label>
                <input 
                  type="text" 
                  value={newChatName}
                  onChange={e => setNewChatName(e.target.value)}
                  placeholder="e.g. PROJECT_OMEGA"
                  className="w-full bg-[#0a0a0f] border border-zinc-800 focus:border-emerald-500 p-2 text-white font-mono text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">CUSTOM PASSPHRASE (REQUIRED)</label>
                <input 
                  type="text" 
                  value={newChatPassphrase}
                  onChange={e => setNewChatPassphrase(e.target.value.toUpperCase())}
                  placeholder="ENTER SECURE PASSPHRASE"
                  className="w-full bg-[#0a0a0f] border border-zinc-800 focus:border-emerald-500 p-2 text-white font-mono text-sm outline-none uppercase"
                />
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer p-3 bg-red-500/5 border border-red-500/20 rounded-sm">
                  <input 
                    type="checkbox" 
                    checked={isEphemeralChat} 
                    onChange={e => setIsEphemeralChat(e.target.checked)} 
                    className="hidden" 
                  />
                  {isEphemeralChat ? <ToggleRight className="text-red-500 w-5 h-5" /> : <ToggleLeft className="text-zinc-600 w-5 h-5" />}
                  <div>
                    <div className="text-red-400 text-xs font-bold tracking-widest uppercase">EPHEMERAL MODE (BURN ON CLOSE)</div>
                    <div className="text-[10px] text-zinc-500 mt-1">Messages exist only in memory and vanish instantly when the browser is closed.</div>
                  </div>
                </label>
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-2 text-xs font-bold tracking-widest uppercase transition-colors">
                  CREATE TUNNEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRenameModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#050505] border border-cyan-400/50 w-full max-w-md p-6 relative">
            <button onClick={() => setShowRenameModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-cyan-400 font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
              <Edit2 className="w-5 h-5" /> RENAME TUNNEL
            </h3>
            
            <form onSubmit={handleRenameChat} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">NEW TUNNEL NAME</label>
                <input 
                  type="text" 
                  value={renameInput}
                  onChange={e => setRenameInput(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-zinc-800 focus:border-cyan-400 p-2 text-white font-mono text-sm outline-none"
                  autoFocus
                />
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-cyan-400 hover:bg-cyan-300 text-black py-2 text-xs font-bold tracking-widest uppercase transition-colors">
                  SAVE NAME
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#050505] border border-red-500/50 w-full max-w-md p-6 relative">
            <button onClick={() => setShowPasswordModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-red-500 font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
              <Key className="w-5 h-5" /> KEY ROTATION
            </h3>
            
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs mb-4">
                WARNING: Changing the terminal password will rotate the encryption key. Existing messages will become unreadable!
              </div>
              <div>
                <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">NEW PASSPHRASE</label>
                <input 
                  type="text" 
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value.toUpperCase())}
                  className="w-full bg-[#0a0a0f] border border-zinc-800 focus:border-red-500 p-2 text-white font-mono text-sm outline-none uppercase"
                  autoFocus
                />
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-red-500 hover:bg-red-400 text-black py-2 text-xs font-bold tracking-widest uppercase transition-colors">
                  EXECUTE KEY ROTATION
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUnlockModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#050505] border border-emerald-500/50 w-full max-w-md p-6 relative">
            <button onClick={() => setShowUnlockModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-emerald-500 font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
              <KeyRound className="w-5 h-5" /> UNLOCK TERMINAL
            </h3>
            
            <form onSubmit={handleUnlockSubmit} className="space-y-4">
              {unlockError && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-500 text-xs mb-2">
                  ERROR: INVALID PASSPHRASE PROVIDED.
                </div>
              )}
              <div>
                <label className="block text-xs text-zinc-500 tracking-widest uppercase mb-1">PASSPHRASE</label>
                <input 
                  type="password" 
                  value={unlockPassword}
                  onChange={e => setUnlockPassword(e.target.value)}
                  onKeyDown={handlePasswordKeyDown}
                  className="w-full bg-[#0a0a0f] border border-zinc-800 focus:border-emerald-500 p-2 text-white font-mono text-sm outline-none uppercase"
                  autoFocus
                />
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-2 text-xs font-bold tracking-widest uppercase transition-colors">
                  DECRYPT & ENTER
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {contextMenu && (
        <div 
          className="fixed z-[100] bg-[#080808] border border-zinc-700 shadow-xl shadow-black py-1 w-48 text-xs text-zinc-300 font-mono"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="w-full text-left px-4 py-2 hover:bg-zinc-800 hover:text-white"
            onClick={() => {
              const chat = chats.find(c => c.id === contextMenu.chatId);
              if (chat) {
                setTargetChatId(chat.id);
                setRenameInput(chat.name);
                setShowRenameModal(true);
              }
              setContextMenu(null);
            }}
          >
            Rename Terminal
          </button>
          <button 
            className="w-full text-left px-4 py-2 hover:bg-zinc-800 hover:text-white"
            onClick={() => {
              setTargetChatId(contextMenu.chatId);
              setPasswordInput('');
              setShowPasswordModal(true);
              setContextMenu(null);
            }}
          >
            Rotate Password Key
          </button>
          <button 
            className="w-full text-left px-4 py-2 hover:bg-zinc-800 hover:text-white"
            onClick={() => {
              archiveChat(contextMenu.chatId);
              setContextMenu(null);
            }}
          >
            Archive Locally
          </button>
          <div className="h-px bg-zinc-800 my-1"></div>
          <button 
            className="w-full text-left px-4 py-2 hover:bg-red-900/30 text-red-500 hover:text-red-400"
            onClick={() => {
              if (confirm("WARNING: This will permanently wipe this terminal and all its messages globally. Proceed?")) {
                deleteChat(contextMenu.chatId);
              }
              setContextMenu(null);
            }}
          >
            Wipe Terminal (Global)
          </button>
        </div>
      )}

    </div>
  );
};

export default TerminalUI;

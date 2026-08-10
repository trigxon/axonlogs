import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Sparkles, 
  Send, 
  Paperclip, 
  Cpu, 
  ShieldCheck, 
  Terminal, 
  Copy, 
  Check, 
  RotateCcw, 
  ThumbsUp, 
  ThumbsDown, 
  Trash2,
  MessageSquareText,
  Lock
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface AIMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  liked?: boolean;
  disliked?: boolean;
}

const SuggestionCards = [
  {
    title: 'Analyze System Logs',
    desc: 'Audit security logs and detect anomaly signatures',
    icon: <Terminal className="w-5 h-5 text-cyan-400" />,
    prompt: 'Perform an in-depth security analysis on the recent system log entries and highlight potential threats.',
  },
  {
    title: 'Security Audit',
    desc: 'Scan current terminal channels and encryption keys',
    icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
    prompt: 'Execute a full cryptographic audit of node keys and transmission protocols.',
  },
  {
    title: 'Summarize Transmissions',
    desc: 'Synthesize decrypted chat feeds into an executive briefing',
    icon: <MessageSquareText className="w-5 h-5 text-purple-400" />,
    prompt: 'Summarize the recent channel transmissions and generate an executive tactical summary.',
  },
  {
    title: 'Draft Encrypted Message',
    desc: 'Compose a high-priority PGP cipher payload draft',
    icon: <Lock className="w-5 h-5 text-amber-400" />,
    prompt: 'Draft an encrypted operational directive for emergency distribution across sub-nodes.',
  },
];

const InitialMessages: AIMessage[] = [
  {
    id: 'msg-init-1',
    sender: 'assistant',
    content: `### AXON AI // PERSONAL INTELLIGENCE UNIT
Welcome Operator. Local WebGPU neural inference engine is loaded and active. 

I can assist with real-time log analysis, transmission synthesis, threat modeling, and cryptographic scripting.

\`\`\`bash
# System Readiness Check
> webgpu_status: OPTIMAL (3.8 TFLOPS)
> model_cache: LLAMA-3-8B-INSTRUCT-Q4F32_1
> security_level: TOP SECRET // NO EXTERNAL API CALLS
\`\`\`

Select a suggestion below or enter a directive to begin.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  },
];

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
        <div className="flex justify-between items-center bg-[#1e1e1e] px-4 py-1 border border-zinc-800 border-b-0 rounded-t">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{match[1]}</span>
          <button 
            onClick={handleCopy}
            className="text-[10px] text-cyan-500 hover:text-cyan-400 uppercase tracking-widest font-bold flex items-center gap-1"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          className="border border-zinc-800 !m-0 !bg-[#0a0a0f] text-xs rounded-b"
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

export const AxonAIShell: React.FC = () => {
  const [messages, setMessages] = useState<AIMessage[]>(InitialMessages);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleSend = (textToSend?: string) => {
    const promptText = (textToSend || input).trim();
    if (!promptText && !attachedFile) return;

    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const userMsg: AIMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: attachedFile ? `${promptText}\n\n*[Attachment: ${attachedFile.name} (${(attachedFile.size / 1024).toFixed(1)} KB)]*` : promptText,
      timestamp: userTimestamp,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachedFile(null);
    setIsGenerating(true);

    // Simulate AI synthesis response based on prompt
    setTimeout(() => {
      let aiResponseText = '';
      const lower = promptText.toLowerCase();

      if (lower.includes('log') || lower.includes('audit')) {
        aiResponseText = `### SYSTEM LOG & SECURITY AUDIT SUMMARY

\`\`\`json
{
  "audit_timestamp": "${new Date().toISOString()}",
  "total_entries_scanned": 1420,
  "security_status": "SECURE",
  "anomalies_detected": 0,
  "active_nodes": ["NODE_ALPHA", "NODE_BRAVO", "AXON_ROOT"],
  "encryption_health": "AES-256-GCM / 100% INTEGRITY"
}
\`\`\`

**Audit Findings:**
- All active transmissions comply with zero-trust steganographic key exchange.
- No unauthorized access attempts recorded in the preceding epoch.
- Local WebGPU execution verified; no outbound data leakage detected.`;
      } else if (lower.includes('summarize') || lower.includes('transmission')) {
        aiResponseText = `### TRANSMISSION SYNTHESIS REPORT

**Key Communications Overview:**
1. **Console Terminals:** 3 active encrypted chat sub-tunnels initialized.
2. **Key Rotations:** All passphrase ciphers intact; no key rotation alerts flagged.
3. **Data Integrity:** All messages successfully decrypted using valid AES keys.

\`\`\`markdown
> Directives: Standard operational security protocol active.
> Recommendation: Proceed with routine node maintenance.
\`\`\``;
      } else if (lower.includes('draft') || lower.includes('encrypt') || lower.includes('message')) {
        aiResponseText = `### PGP CIPHER DRAFT PROTOCOL

Here is your drafted encrypted transmission payload:

\`\`\`text
-----BEGIN PGP MESSAGE-----
Version: AxonCrypt v2.4.0
Comment: Authorized Personal Intelligence Payload

hQGMA7z9Kx0vB... [ENCRYPTED DATA STREAM] ...mQENBF4/
=9aXz
-----END PGP MESSAGE-----
\`\`\`

*Directive: This payload has been pre-formatted for secure node-to-node relay.*`;
      } else {
        aiResponseText = `### DIRECTIVE PROCESSED // AXON AI

Received operational query:
> "${promptText}"

\`\`\`bash
# Execution Log
[100%] Neural tokenization complete
[100%] Context window parsed (8,192 tokens max)
[OK] Response generated via local WebGPU shader pipeline
\`\`\`

All requested instructions have been executed locally within your sandbox. Additional directives may be submitted at any time.`;
      }

      const aiMsg: AIMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        content: aiResponseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      };

      setMessages(prev => [...prev, aiMsg]);
      setIsGenerating(false);
    }, 900);
  };

  const handleCopyMessage = (msgId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleFeedback = (msgId: string, type: 'like' | 'dislike') => {
    setMessages(prev =>
      prev.map(msg => {
        if (msg.id !== msgId) return msg;
        if (type === 'like') {
          return { ...msg, liked: !msg.liked, disliked: false };
        } else {
          return { ...msg, disliked: !msg.disliked, liked: false };
        }
      })
    );
  };

  const handleRegenerate = () => {
    const lastUserMsg = [...messages].reverse().find(m => m.sender === 'user');
    if (lastUserMsg) {
      handleSend(lastUserMsg.content);
    }
  };

  const handleClearFeed = () => {
    setMessages(InitialMessages);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-[#a3a3a3] font-mono overflow-hidden">
      {/* HEADER BAR */}
      <header className="h-16 border-b border-zinc-800/80 bg-[#08080c] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Bot className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-widest text-cyan-400 uppercase">
                AXON AI // Personal Intelligence Unit
              </h1>
            </div>
            <p className="text-[10px] text-zinc-500 tracking-wider">
              Local WebGPU Neural Inference Engine & System Workspace Assistant
            </p>
          </div>
        </div>

        {/* STATUS & MODEL BADGES */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            LOCAL WEBGPU READY
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold tracking-widest uppercase">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            LLAMA-3-8B-INSTRUCT-Q4F32_1
          </div>
          <button
            onClick={handleClearFeed}
            title="Clear Feed"
            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT FEED AREA */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#050505]">
        {/* SUGGESTION CARDS GRID (shown when message count is small or initial) */}
        {messages.length <= 2 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              QUICK DISPATCH DIRECTIVES
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {SuggestionCards.map((card, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(card.prompt)}
                  className="flex flex-col items-start p-4 bg-[#0a0a0f] border border-zinc-800/90 rounded hover:border-cyan-500/50 hover:bg-cyan-950/10 transition-all text-left group cursor-pointer shadow-sm hover:shadow-cyan-950/20"
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <div className="p-2 rounded bg-zinc-900 border border-zinc-800 group-hover:border-cyan-500/30 transition-colors">
                      {card.icon}
                    </div>
                    <span className="text-[10px] text-zinc-600 font-mono group-hover:text-cyan-400 transition-colors">RUN →</span>
                  </div>
                  <h3 className="text-xs font-bold text-zinc-200 group-hover:text-cyan-300 transition-colors tracking-wide uppercase mb-1">
                    {card.title}
                  </h3>
                  <p className="text-[11px] text-zinc-500 leading-normal line-clamp-2">
                    {card.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* INTERACTIVE MESSAGES */}
        <div className="space-y-6">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';

            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-4xl border p-5 rounded relative group transition-all ${
                  isUser
                    ? 'ml-auto bg-cyan-950/10 border-cyan-500/40 text-zinc-100'
                    : 'bg-[#0a0a0f] border-zinc-800/90 border-l-4 border-l-cyan-400 text-zinc-200 shadow-md'
                }`}
              >
                {/* MESSAGE HEADER */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800/50">
                  <div className="flex items-center gap-2">
                    {isUser ? (
                      <div className="w-6 h-6 rounded bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-[10px] font-bold text-cyan-300">
                        OP
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-[10px] font-bold text-purple-300">
                        AI
                      </div>
                    )}
                    <span className={`text-xs font-bold tracking-widest uppercase ${isUser ? 'text-cyan-400' : 'text-purple-400'}`}>
                      {isUser ? 'OPERATOR DIRECTIVE' : 'AXON AI INTELLIGENCE'}
                    </span>
                  </div>

                  <span className="text-[10px] text-zinc-500 tracking-wider">
                    {msg.timestamp}
                  </span>
                </div>

                {/* MESSAGE CONTENT */}
                <div className="text-xs leading-relaxed font-mono">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: CodeBlock,
                      p({ children }) {
                        return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
                      },
                      a({ href, children }) {
                        return (
                          <a href={href} className="text-cyan-400 hover:underline" target="_blank" rel="noreferrer">
                            {children}
                          </a>
                        );
                      },
                      ul({ children }) {
                        return <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>;
                      },
                      ol({ children }) {
                        return <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>;
                      },
                      li({ children }) {
                        return <li className="mb-0.5">{children}</li>;
                      },
                      blockquote({ children }) {
                        return (
                          <blockquote className="border-l-2 border-cyan-500/50 pl-3 italic text-zinc-400 my-2">
                            {children}
                          </blockquote>
                        );
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>

                {/* ACTION BUTTONS BAR */}
                <div className="mt-4 pt-2 border-t border-zinc-800/40 flex items-center justify-between text-[11px] text-zinc-500">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="flex items-center gap-1 hover:text-cyan-400 transition-colors cursor-pointer"
                      title="Copy content"
                    >
                      {copiedMsgId === msg.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                    </button>

                    {!isUser && (
                      <>
                        <button
                          onClick={() => handleFeedback(msg.id, 'like')}
                          className={`flex items-center gap-1 hover:text-emerald-400 transition-colors cursor-pointer ${
                            msg.liked ? 'text-emerald-400 font-bold' : ''
                          }`}
                          title="Helpful"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleFeedback(msg.id, 'dislike')}
                          className={`flex items-center gap-1 hover:text-red-400 transition-colors cursor-pointer ${
                            msg.disliked ? 'text-red-400 font-bold' : ''
                          }`}
                          title="Unhelpful"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {!isUser && (
                    <button
                      onClick={handleRegenerate}
                      className="flex items-center gap-1 text-zinc-500 hover:text-cyan-400 transition-colors cursor-pointer"
                      title="Regenerate response"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Regenerate</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {isGenerating && (
            <div className="flex items-center gap-3 p-4 bg-[#0a0a0f] border border-cyan-500/30 rounded text-xs text-cyan-400 font-mono">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>AXON AI IS SYNTHESIZING RESPONSE VIA WEBGPU...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* INPUT BAR */}
      <footer className="p-4 border-t border-zinc-800/80 bg-[#08080c] shrink-0">
        {attachedFile && (
          <div className="mb-2 px-3 py-1.5 bg-cyan-950/30 border border-cyan-500/30 rounded flex items-center justify-between text-xs text-cyan-300">
            <span className="truncate">Attachment: {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="text-zinc-500 hover:text-red-400 text-xs px-1 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-3"
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) setAttachedFile(e.target.files[0]);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            className="p-2.5 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800/60 rounded transition-colors shrink-0 cursor-pointer"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ENTER AXON AI DIRECTIVE OR PROMPT..."
            className="flex-1 bg-[#050505] border border-zinc-800 focus:border-cyan-400 px-4 py-2.5 text-xs text-white outline-none font-mono placeholder:text-zinc-700 uppercase rounded transition-colors"
          />

          <button
            type="submit"
            disabled={!input.trim() && !attachedFile}
            className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black px-5 py-2.5 text-xs font-bold tracking-widest flex items-center gap-2 transition-colors uppercase rounded shrink-0 cursor-pointer"
          >
            <span>SEND</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </footer>
    </div>
  );
};

export default AxonAIShell;

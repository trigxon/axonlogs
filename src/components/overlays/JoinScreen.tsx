import React, { useState } from 'react';
import { ShieldCheck, LogIn, PlusSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface JoinScreenProps {
  onJoin: (username: string, roomId: string, roomPassword: string) => void;
}

const JoinScreen: React.FC<JoinScreenProps> = ({ onJoin }) => {
  const [mode, setMode] = useState<'JOIN' | 'CREATE'>('JOIN');
  
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || '';
  });
  const [roomPassword, setRoomPassword] = useState('');
  const [error, setError] = useState('');

  const handleGenerateRoom = () => {
    const id = 'ws_' + Math.random().toString(36).substr(2, 9);
    setRoomId(id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    const cleanRoom = roomId.trim();
    const cleanPass = roomPassword.trim();

    if (!cleanUser) return setError('USERNAME_REQUIRED');
    if (!cleanRoom) return setError('WORKSPACE_ID_REQUIRED');
    if (!cleanPass) return setError('ENCRYPTION_KEY_REQUIRED');
    if (cleanPass.length < 8) return setError('ENCRYPTION_KEY_TOO_WEAK (Min 8 chars)');

    onJoin(cleanUser, cleanRoom, cleanPass);
  };

  return (
    <div className="fixed inset-0 bg-[#050505] z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, type: 'spring' }}
        className="w-full max-w-md bg-[#0a0a0f] border border-white/10 shadow-2xl relative overflow-hidden"
      >
        <div className="h-1 bg-cyan-neon w-full absolute top-0 left-0" />
        
        <div className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(0,229,255,0.1)]">
              <ShieldCheck className="w-8 h-8 text-cyan-neon" />
            </div>
            <h1 className="text-2xl font-bold tracking-widest text-white">AXON <span className="text-cyan-neon">WORKSPACE</span></h1>
            <p className="text-xs text-muted-gray mt-2 tracking-widest font-mono text-center">
              SECURE PERSISTENT TERMINAL
            </p>
          </div>

          <div className="flex gap-2 mb-6 font-mono text-xs">
            <button 
              onClick={() => { setMode('JOIN'); setError(''); }}
              className={`flex-1 py-2 border ${mode === 'JOIN' ? 'bg-cyan-neon/10 border-cyan-neon text-cyan-neon' : 'border-white/10 text-muted-gray hover:bg-white/5'} transition-all`}
            >
              JOIN WORKSPACE
            </button>
            <button 
              onClick={() => { setMode('CREATE'); setError(''); handleGenerateRoom(); }}
              className={`flex-1 py-2 border ${mode === 'CREATE' ? 'bg-cyan-neon/10 border-cyan-neon text-cyan-neon' : 'border-white/10 text-muted-gray hover:bg-white/5'} transition-all`}
            >
              INITIALIZE NEW
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 font-mono">
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-alert/10 border border-alert text-alert text-xs p-3 rounded overflow-hidden"
                >
                  [ERROR] {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1">
              <label className="text-xs text-muted-gray block tracking-wider">
                &gt; USERNAME_ALIAS
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                className="w-full bg-black/50 border border-white/20 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-neon transition-all"
                placeholder="e.g. SysAdmin"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-gray flex justify-between tracking-wider">
                <span>&gt; WORKSPACE_ID</span>
                {mode === 'CREATE' && (
                  <button type="button" onClick={handleGenerateRoom} className="text-cyan-neon hover:underline">
                    [ REGENERATE ]
                  </button>
                )}
              </label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => { setRoomId(e.target.value); setError(''); }}
                readOnly={mode === 'CREATE'}
                className={`w-full bg-black/50 border border-white/20 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-neon transition-all ${mode === 'CREATE' ? 'text-cyan-neon opacity-70' : ''}`}
                placeholder="Workspace ID"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-gray block tracking-wider">
                &gt; ENCRYPTION_KEY (PASSWORD)
              </label>
              <input
                type="password"
                value={roomPassword}
                onChange={(e) => { setRoomPassword(e.target.value); setError(''); }}
                className="w-full bg-black/50 border border-white/20 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-neon transition-all"
                placeholder="Minimum 8 characters"
                autoComplete="off"
              />
              <p className="text-[10px] text-muted-gray/70 mt-1">
                {mode === 'CREATE' 
                  ? "This key will encrypt all messages. Do not lose it."
                  : "Enter the key provided by the workspace admin."}
              </p>
            </div>

            <button
              type="submit"
              className="w-full bg-cyan-neon text-void font-bold py-3 mt-6 flex items-center justify-center gap-2 hover:bg-cyan-neon/90 transition-all uppercase tracking-wider"
            >
              {mode === 'CREATE' ? <PlusSquare className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              {mode === 'CREATE' ? 'Initialize Workspace' : 'Enter Workspace'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default JoinScreen;

import React, { useState } from 'react';
import { ShieldCheck, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

interface JoinScreenProps {
  onJoin: (username: string, roomCode: string) => void;
}

const JoinScreen: React.FC<JoinScreenProps> = ({ onJoin }) => {
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || '';
  });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    const cleanRoom = roomCode.trim();

    if (!cleanUser) {
      setError('USERNAME_REQUIRED');
      return;
    }
    if (cleanUser.length > 20) {
      setError('USERNAME_TOO_LONG');
      return;
    }
    if (!cleanRoom) {
      setError('ROOM_CODE_REQUIRED');
      return;
    }

    onJoin(cleanUser, cleanRoom);
  };

  return (
    <div className="fixed inset-0 bg-[#050505] z-50 flex items-center justify-center p-4">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, type: 'spring' }}
        className="w-full max-w-md bg-[#0a0a0f] border border-white/10 shadow-2xl relative overflow-hidden"
      >
        {/* Decorative Top Bar */}
        <div className="h-1 bg-cyan-neon w-full absolute top-0 left-0" />
        
        <div className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(0,229,255,0.1)]">
              <ShieldCheck className="w-8 h-8 text-cyan-neon" />
            </div>
            <h1 className="text-2xl font-bold tracking-widest text-white">AXON <span className="text-cyan-neon">LOGS</span></h1>
            <p className="text-xs text-muted-gray mt-2 tracking-widest font-mono text-center">
              E2EE EPHEMERAL COMMUNICATION
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 font-mono">
            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-alert/10 border border-alert text-alert text-xs p-3 rounded"
              >
                [ERROR] {error}
              </motion.div>
            )}

            <div className="space-y-2">
              <label htmlFor="username" className="text-xs text-muted-gray block tracking-wider">
                &gt; USERNAME_ALIAS
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                className="w-full bg-black/50 border border-white/20 text-white px-4 py-3 text-sm focus:outline-none focus:border-cyan-neon focus:ring-1 focus:ring-cyan-neon/50 transition-all placeholder:text-white/20"
                placeholder="e.g. Neo"
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="roomCode" className="text-xs text-muted-gray block tracking-wider">
                &gt; ROOM_CODE (IP / HASH)
              </label>
              <input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value);
                  setError('');
                }}
                className="w-full bg-black/50 border border-white/20 text-white px-4 py-3 text-sm focus:outline-none focus:border-cyan-neon focus:ring-1 focus:ring-cyan-neon/50 transition-all placeholder:text-white/20"
                placeholder="e.g. 192.168.1.1 or alpha_team"
                autoComplete="off"
              />
              <p className="text-[10px] text-muted-gray/70 mt-1">
                Both nodes must enter the exact same string to encrypt the link.
              </p>
            </div>

            <button
              type="submit"
              className="w-full bg-cyan-neon text-void font-bold py-3 mt-4 flex items-center justify-center gap-2 hover:bg-cyan-neon/90 hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] transition-all uppercase tracking-wider"
            >
              <LogIn className="w-4 h-4" />
              Establish Uplink
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default JoinScreen;

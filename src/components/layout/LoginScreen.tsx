import React, { useState } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';
import { Terminal, Shield, Lock } from 'lucide-react';

const LoginScreen: React.FC = () => {
  const { login } = useCrypto();
  const [alias, setAlias] = useState('');
  const [roomCode, setRoomCode] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (alias.trim() && roomCode.trim()) {
      login(alias.trim(), roomCode.trim());
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#050505] text-[#10b981] flex flex-col items-center justify-center font-mono p-4">
      <div className="w-full max-w-md border border-[#10b981]/30 bg-[#0a0a0f] p-8 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
        
        <div className="flex flex-col items-center gap-4 mb-8">
          <Terminal className="w-12 h-12 text-[#10b981]" />
          <h1 className="text-2xl font-bold tracking-[0.2em] text-[#10b981]">AXON // TERMINAL</h1>
          <p className="text-xs text-[#059669] tracking-widest text-center">
            END-TO-END ENCRYPTED SECURE CHANNEL
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold tracking-widest text-[#059669] flex items-center gap-2">
              <Shield className="w-3 h-3" />
              OPERATIVE ALIAS
            </label>
            <input 
              type="text" 
              value={alias}
              onChange={e => setAlias(e.target.value)}
              className="w-full bg-[#050505] border border-[#10b981]/30 text-[#10b981] px-4 py-3 focus:outline-none focus:border-[#10b981] transition-colors font-mono uppercase placeholder:text-[#10b981]/20"
              placeholder="GHOST_1"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold tracking-widest text-[#059669] flex items-center gap-2">
              <Lock className="w-3 h-3" />
              SECURE_LINK (ROOM CODE)
            </label>
            <input 
              type="password" 
              value={roomCode}
              onChange={e => setRoomCode(e.target.value)}
              className="w-full bg-[#050505] border border-[#10b981]/30 text-[#10b981] px-4 py-3 focus:outline-none focus:border-[#10b981] transition-colors font-mono tracking-widest placeholder:text-[#10b981]/20"
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit"
            className="w-full bg-[#10b981]/10 hover:bg-[#10b981]/20 border border-[#10b981]/50 text-[#10b981] font-bold tracking-widest py-4 transition-all"
          >
            [ INITIATE CONNECTION ]
          </button>
        </form>

      </div>
    </div>
  );
};

export default LoginScreen;

import { useEffect, useState } from 'react';
import { Settings, Menu, Shield, Terminal as TerminalIcon } from 'lucide-react';
import { useCrypto } from '../../contexts/CryptoContext';
import { cn } from '../../lib/utils';

interface TopNavProps {
  toggleSidebar: () => void;
  toggleSettings: () => void;
}

const TopNav: React.FC<TopNavProps> = ({ toggleSidebar, toggleSettings }) => {
  const { clearMessages, connected } = useCrypto();
  const [latency, setLatency] = useState(0);

  // Simulate latency if connected
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      setLatency(Math.floor(Math.random() * 20) + 12);
    }, 3000);
    return () => clearInterval(interval);
  }, [connected]);

  return (
    <header className="h-14 flex justify-between items-center px-4 md:px-6 border-b border-white/10 bg-[#0a0a0f] z-20 shrink-0">
      <div className="flex items-center gap-4">
        <button className="md:hidden text-cyan-neon p-2" onClick={toggleSidebar}>
          <Menu className="w-5 h-5" />
        </button>
        
        <div className="hidden md:flex items-center gap-2 text-cyan-neon font-bold tracking-wider">
          <TerminalIcon className="w-5 h-5" />
          <span>AXON_LOGS</span>
          <span className="w-2 h-5 bg-cyan-neon animate-pulse ml-1" />
        </div>

        <div className="hidden md:flex ml-8 gap-6 text-sm text-muted-gray">
          <button className="hover:text-cyan-neon transition-colors">STATION_ALPHA</button>
          <button className="hover:text-cyan-neon transition-colors">STATION_BETA</button>
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm">
        {connected ? (
          <div className="hidden sm:flex items-center gap-2 border border-white/10 px-2 py-1 rounded bg-black/50 text-matrix">
            <span className="w-2 h-2 rounded-full bg-matrix animate-pulse" />
            LATENCY: {latency}ms
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-2 border border-white/10 px-2 py-1 rounded bg-black/50 text-alert">
            <span className="w-2 h-2 rounded-full bg-alert" />
            OFFLINE
          </div>
        )}

        <div className={cn(
          "flex items-center gap-1 border px-2 py-1 rounded bg-black/50",
          connected ? "border-matrix text-matrix" : "border-muted-gray text-muted-gray"
        )}>
          <Shield className="w-3 h-3" />
          <span className="hidden sm:inline">AES-256</span> ACTIVE
        </div>

        <button 
          onClick={clearMessages}
          className="border border-white/10 hover:border-alert hover:text-alert px-3 py-1 rounded transition-colors"
        >
          <span className="hidden sm:inline">PURGE TERMINAL</span>
          <span className="sm:hidden">PURGE</span>
        </button>

        <button 
          onClick={toggleSettings}
          className="p-1.5 border border-white/10 hover:border-cyan-neon hover:text-cyan-neon rounded transition-colors ml-2"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

export default TopNav;

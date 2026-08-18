import React, { useState } from 'react';
import { FileText, Search, Trash2, Activity, ShieldCheck, ChevronRight } from 'lucide-react';
import { useCrypto } from '../../contexts/CryptoContext';

export const LogsView: React.FC = () => {
  const { systemLogs, addLog, clearLogs } = useCrypto();
  const [filter, setFilter] = useState('');

  const handleClear = () => {
    if (confirm('WARNING: This will purge all system log entries from the local buffer. Proceed?')) {
      clearLogs();
      addLog('[SYSTEM: LOG BUFFER PURGED BY OPERATOR]');
    }
  };

  const filtered = systemLogs.filter(log =>
    !filter || log.msg.toLowerCase().includes(filter.toLowerCase()) || log.time.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full glass-panel theme-text text-[#a3a3a3] font-mono overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-white/[0.06] bg-[#090910] px-4 md:px-6 flex items-center justify-between gap-3 shrink-0 hairline-gradient">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest text-emerald-400 uppercase flex items-center gap-2">
              SYSTEM EVENT LOG
            </h1>
            <p className="text-[10px] text-zinc-500 tracking-wider">
              In-memory forensic audit trail of node activity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
            {systemLogs.length} ENTRIES CAPTURED
          </div>
          <button
            onClick={handleClear}
            title="Purge Log Buffer"
            className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="px-4 md:px-6 py-3 border-b border-white/[0.05] bg-[#060609]/60 shrink-0">
        <div className="flex items-center gap-2 bg-[#050505] border border-zinc-800 px-3 py-1.5 focus-within:border-emerald-500/50 max-w-md">
          <Search className="w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="FILTER EVENTS..."
            className="bg-transparent border-none outline-none text-xs text-zinc-200 w-full placeholder:text-zinc-700 uppercase"
          />
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-3">
            <ShieldCheck className="w-10 h-10 text-zinc-700" />
            <p className="text-xs tracking-widest uppercase">
              {systemLogs.length === 0
                ? '[NO SYSTEM EVENTS LOGGED YET]'
                : '[NO EVENTS MATCH FILTER]'}
            </p>
          </div>
        ) : (
          <div className="relative card-lux rounded-xl overflow-hidden divide-y divide-white/[0.05]">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500" />
            {filtered.map((log, idx) => (
              <div key={log.id || idx} className="flex items-start gap-3 pl-6 pr-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                <ChevronRight className="w-3.5 h-3.5 text-emerald-500/60 mt-0.5 shrink-0" />
                <span className="text-[10px] text-zinc-600 font-mono shrink-0 pt-0.5 tabular-nums">
                  {new Date(log.time).toLocaleString([], { hour12: true })}
                </span>
                <span className="text-xs text-zinc-300 font-mono leading-relaxed break-words">
                  {log.msg}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-4 md:px-6 py-3 border-t border-white/[0.06] bg-[#07070c]/70 flex items-center justify-between gap-3 shrink-0">
        <span className="text-[10px] text-zinc-600 tracking-widest uppercase flex items-center gap-2">
          <FileText className="w-3 h-3" /> LOGS ARE VOLATILE // CLEARED ON SESSION TERMINATION
        </span>
        <span className="text-[10px] text-emerald-500 tracking-widest uppercase">TAILING LIVE BUFFER</span>
      </footer>
    </div>
  );
};

export default LogsView;

import React from 'react';
import { ShieldCheck, KeyRound, Lock } from 'lucide-react';

/**
 * Highlighted security assurance — rendered wherever the user needs to
 * SEE the guarantees, not squint at a disclaimer:
 *   • Passwords are PBKDF2-hashed on-device before upload.
 *   • Messages stay end-to-end encrypted.
 * Used by: AuthScreen (login + signup), ProfilePanel (Security & data),
 * SettingsPanel (Privacy & Mitigation), ChatApp (welcome state).
 */
export const SecurityNote: React.FC<{ className?: string; compact?: boolean }> = ({
  className = '',
  compact = false,
}) => (
  <div
    className={`rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] shadow-[0_0_18px_-6px_rgba(16,185,129,0.45)] ${compact ? 'px-3.5 py-2.5' : 'px-4 py-3.5'} ${className}`}
    role="note"
    aria-label="Security guarantees"
  >
    <div className="flex items-start gap-2.5">
      <ShieldCheck className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-emerald-400 shrink-0 mt-0.5`} />
      <div className={`min-w-0 ${compact ? 'text-[10px]' : 'text-xs'} leading-relaxed font-mono`}>
        <p className="flex items-center gap-1.5 font-bold text-emerald-300">
          <KeyRound className="w-3 h-3 shrink-0 text-emerald-400" />
          <span>Passwords are PBKDF2-hashed on-device before upload.</span>
        </p>
        <p className="flex items-center gap-1.5 font-bold text-cyan-300 mt-1">
          <Lock className="w-3 h-3 shrink-0 text-cyan-400" />
          <span>Messages stay end-to-end encrypted.</span>
        </p>
      </div>
    </div>
  </div>
);

export default SecurityNote;

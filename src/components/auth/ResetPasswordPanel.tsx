import React, { useState } from 'react';
import { KeyRound, Check, ArrowLeft } from 'lucide-react';
import { supabase, useCrypto } from '../../contexts/CryptoContext';
import { completePasswordReset } from '../../utils/auth';

/**
 * Password reset landing (/reset). The recovery email link opens this route
 * WITH a session attached (Supabase consumes the token in the URL), so the
 * user sets a new password once and continues. Without a session (someone
 * typing the URL directly) it explains how to get a fresh link.
 */
export const ResetPasswordPanel: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { addLog } = useCrypto();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(supabase ? null : false);

  React.useEffect(() => {
    let dead = false;
    if (!supabase) return;
    supabase.auth
      .getUser()
      .then(({ data }: any) => { if (!dead) setHasSession(!!data?.user); })
      .catch(() => { if (!dead) setHasSession(false); });
    return () => { dead = true; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !supabase) return;
    setError(null);
    if (p1 !== p2) { setError("The two passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await completePasswordReset(supabase, p1);
      if (!res.ok) { setError(res.error); return; }
      setDone(true);
      addLog('Password reset from recovery link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
          <KeyRound className="w-6 h-6 text-cyan-300" />
        </div>
        {hasSession === false ? (
          <>
            <div className="text-white font-bold text-sm">No recovery session</div>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Open the password-recovery link from your email on this device — it signs you in once and
              brings you back here. Already signed in? Change the password in Settings → Account instead.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" /> Back to log in
            </button>
          </>
        ) : done ? (
          <>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Check className="w-6 h-6 text-emerald-300" />
            </div>
            <div className="text-white font-bold text-sm">Password updated</div>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Your new password works on every device from now on.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2"
            >
              Go to chats
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3 text-left">
            <div className="text-white font-bold text-sm text-center">Set a new password</div>
            <p className="text-zinc-500 text-xs leading-relaxed text-center">
              Pick something you'll remember — at least 6 characters.
            </p>
            <input
              type="password"
              value={p1}
              onChange={e => { setP1(e.target.value); setError(null); }}
              placeholder="New password"
              autoComplete="new-password"
              className="w-full bg-[#050505] border border-zinc-800 focus:border-cyan-500 px-3 py-2 text-white text-xs outline-none rounded-md transition-colors"
              aria-label="New password"
            />
            <input
              type="password"
              value={p2}
              onChange={e => { setP2(e.target.value); setError(null); }}
              placeholder="Repeat the new password"
              autoComplete="new-password"
              className="w-full bg-[#050505] border border-zinc-800 focus:border-cyan-500 px-3 py-2 text-white text-xs outline-none rounded-md transition-colors"
              aria-label="Repeat the new password"
            />
            {error && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy || !p1 || !p2}
              className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'Saving…' : (<><Check className="w-4 h-4" /> Save new password</>)}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPanel;

import React, { useEffect, useState } from 'react';
import { AtSign, Lock, Eye, EyeOff, UserPlus, LogIn, AlertTriangle, Check, X } from 'lucide-react';
import { supabase, useCrypto } from '../../contexts/CryptoContext';
import {
  signupAccount,
  loginAccount,
  validateUsername,
  usernameAvailable,
  isMissingTableError,
} from '../../utils/auth';

/**
 * Instagram-style auth screen (login / signup) rendered inside the
 * restored macOS window chrome. Username + password accounts; the
 * password is PBKDF2-hashed locally and never leaves the device.
 */
export const AuthScreen: React.FC = () => {
  const { loginWithAccount, myGradient, deviceId, addLog } = useCrypto();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [avail, setAvail] = useState<'ok' | 'taken' | null>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Instagram-style live availability check while typing (signup only).
  const uClean = username.trim().toLowerCase();
  const uValid = mode === 'signup' && uClean.length > 0 && !validateUsername(uClean);
  useEffect(() => {
    if (!uValid) { setAvail(null); return; }
    let dead = false;
    setAvail(null);
    const t = setTimeout(async () => {
      if (!supabase) return;
      try {
        const ok = await usernameAvailable(supabase, uClean);
        if (!dead) setAvail(ok ? 'ok' : 'taken');
      } catch { /* offline — silently skip the live check */ }
    }, 400);
    return () => { dead = true; clearTimeout(t); };
  }, [uValid, uClean]);

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m);
    setError(null);
    setNeedsSetup(false);
    setAvail(null);
  };

  const finishLocally = () => {
    // Escape hatch: keep the app usable without the cloud backend.
    const fallbackName = `node_${deviceId.substring(0, 6).toLowerCase()}`;
    loginWithAccount({ username: username.trim().toLowerCase() || fallbackName, accountId: `local-${deviceId}`, local: true });
    addLog('Continuing in local mode (no cloud account)');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNeedsSetup(false);

    const uError = validateUsername(username);
    if (uError) { setError(uError); return; }
    if (!password) { setError('Enter your password.'); return; }

    if (!supabase) {
      setError('Cloud backend not configured on this deployment.');
      setNeedsSetup(true);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const res = await signupAccount(supabase, username, password, myGradient);
        if (!res.ok) {
          setError(res.error);
          if (isMissingTableError(res.error)) setNeedsSetup(true);
          return;
        }
        loginWithAccount({ username: res.account.username, accountId: res.account.id });
      } else {
        const res = await loginAccount(supabase, username, password);
        if (!res.ok) {
          setError(res.error);
          if (isMissingTableError(res.error)) setNeedsSetup(true);
          return;
        }
        loginWithAccount({ username: res.account.username, accountId: res.account.id });
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-app w-full premium-bg text-[#d6d8de] font-mono overflow-hidden relative scanlines">
      {/* ambient background */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grid-overlay" />
        <div className="absolute inset-0 vignette" />
      </div>

      {/* ── MAC WINDOW ── */}
      <div className="relative z-10 flex-1 h-full flex flex-col min-h-0 p-2 sm:p-3 lg:p-5">
        <div className="term-window flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="term-inner-glow" aria-hidden />

          {/* TITLE BAR */}
          <div className="term-titlebar h-9 shrink-0 flex items-center gap-3 px-3 sm:px-4 lg:px-7 border-b border-white/[0.07] select-none">
            <div className="flex items-center gap-2 shrink-0" aria-hidden>
              <span className="tl tl-red" />
              <span className="tl tl-amber" />
              <span className="tl tl-green" />
            </div>
            <div className="flex-1 min-w-0 text-center">
              <span className="font-display text-[10px] font-bold tracking-[0.3em] uppercase truncate block">
                <span className="text-gradient phosphor-text">Axon Logs</span>
                <span className="text-zinc-600 hidden sm:inline"> — accounts</span>
                <span className="text-emerald-500/70 hidden lg:inline"> // axon@axonlogs:~/auth</span>
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-[9px] md:text-[10px] font-bold tracking-widest uppercase text-zinc-500 tabular-nums">
              <span className="hidden sm:inline text-cyan-500/90">AUTH GATE</span>
              <span className="text-emerald-500/90">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
            </div>
          </div>

          {/* AUTH BODY */}
          <div className="flex-1 min-h-0 overflow-y-auto feed-scroll flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-sm">
              {/* Logo */}
              <div className="flex flex-col items-center mb-8 text-center">
                <div className="w-20 h-20 rounded-2xl ring-gradient flex items-center justify-center mb-4 glow-cyan">
                  <span className="font-display text-2xl font-black tracking-widest text-gradient phosphor-text">AL</span>
                </div>
                <h1 className="text-white font-bold text-2xl tracking-wide">Axon Logs</h1>
                {mode === 'signup' ? (
                  <p className="text-zinc-500 text-xs mt-2 text-center leading-relaxed">
                    Sign up to message friends privately.<br />No feeds. No reels. No noise.
                  </p>
                ) : (
                  <p className="text-zinc-500 text-xs mt-2 text-center leading-relaxed">
                    Log in to your private messenger.
                  </p>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* username */}
                <div className="term-input rounded-lg px-3 py-2.5 flex items-center gap-2.5 focus-within:border-cyan-400/60 transition-colors">
                  <AtSign className="w-4 h-4 text-zinc-500 shrink-0" />
                  <input
                    type="text"
                    value={username}
                    onChange={e => { setUsername(e.target.value.toLowerCase()); setError(null); }}
                    placeholder="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={30}
                    className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600"
                    aria-label="Username"
                  />
                </div>

                {/* username feedback — Instagram rules + live availability */}
                {mode === 'signup' && (
                  <div className="min-h-[18px] px-1 flex items-center gap-1.5 text-[11px] leading-snug">
                    {avail === 'ok' ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3 shrink-0" /> @{uClean} is available
                      </span>
                    ) : avail === 'taken' ? (
                      <span className="text-red-400 flex items-center gap-1">
                        <X className="w-3 h-3 shrink-0" /> This username isn't available. Try another.
                      </span>
                    ) : uValid && supabase ? (
                      <span className="text-zinc-600">Checking availability…</span>
                    ) : (
                      <span className="text-zinc-600">Letters, numbers, periods and underscores. Up to 30 characters.</span>
                    )}
                  </div>
                )}

                {/* password */}
                <div className="term-input rounded-lg px-3 py-2.5 flex items-center gap-2.5 focus-within:border-cyan-400/60 transition-colors">
                  <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(null); }}
                    placeholder="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600"
                    aria-label="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {error && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
                    {error}
                  </div>
                )}
                {needsSetup && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      One-time backend setup: open your Supabase dashboard → SQL Editor and run the updated
                      <code className="text-amber-200 mx-1">supabase/schema.sql</code> from the repo (adds the accounts + dm_invites tables).
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? (
                    <span className="text-[10px] tracking-[0.3em] uppercase">Connecting…</span>
                  ) : mode === 'signup' ? (
                    <><UserPlus className="w-4 h-4" /> Create account</>
                  ) : (
                    <><LogIn className="w-4 h-4" /> Log in</>
                  )}
                </button>
              </form>

              {/* mode switch */}
              <div className="mt-5 text-center">
                <div className="h-px bg-white/[0.07] mb-4" />
                {mode === 'login' ? (
                  <p className="text-xs text-zinc-500">
                    Don't have an account?{' '}
                    <button onClick={() => switchMode('signup')} className="text-cyan-400 font-bold hover:text-cyan-300 transition-colors">
                      Sign up
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Have an account?{' '}
                    <button onClick={() => switchMode('login')} className="text-cyan-400 font-bold hover:text-cyan-300 transition-colors">
                      Log in
                    </button>
                  </p>
                )}
              </div>

              {/* local escape hatch */}
              {!supabase && (
                <button
                  onClick={finishLocally}
                  className="mt-6 w-full term-panel term-interactive py-2.5 rounded-lg text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-400 hover:text-cyan-300 border border-white/[0.07] transition-colors"
                >
                  Continue in local mode
                </button>
              )}

              <p className="mt-6 text-center text-[9px] tracking-[0.2em] uppercase text-zinc-700 leading-relaxed">
                Passwords are PBKDF2-hashed on-device before upload.<br />
                Messages stay end-to-end encrypted.
              </p>
            </div>
          </div>

          {/* STATUS BAR */}
          <div className="term-statusbar shrink-0 border-t border-white/[0.07] flex items-center gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 md:px-6 lg:px-7 text-[8px] sm:text-[9px] md:text-[10px] font-bold tracking-widest uppercase select-none min-h-[28px] md:min-h-[32px]">
            <span className="flex items-center gap-1.5 shrink-0 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full dot-live" />
              <span className="hidden sm:inline">SECURE GATE</span>
              <span className="sm:hidden">OK</span>
            </span>
            <span className="text-zinc-500 hidden sm:inline">AES-256 · PBKDF2 · NO LOGS</span>
            <div className="flex-1" />
            <span className="text-cyan-500/90 hidden md:inline">NODE: {deviceId.substring(0, 8)}</span>
            <span className="text-emerald-500/90 tabular-nums shrink-0">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;

import React, { useEffect, useState } from 'react';
import {
  AtSign, Lock, Eye, EyeOff, UserPlus, LogIn, AlertTriangle, Check, X,
  Mail, Phone, KeyRound, ArrowLeft,
} from 'lucide-react';
import { supabase, useCrypto } from '../../contexts/CryptoContext';
import SecurityNote from '../ui/SecurityNote';
import {
  signupWithContact,
  verifySignupOtp,
  resendContactConfirmation,
  requestPasswordReset,
  validateContact,
  validateUsername,
  usernameAvailable,
  isMissingTableError,
  loginAccount,
  parseContact,
} from '../../utils/auth';

type AuthMode = 'login' | 'signup' | 'confirm' | 'otp' | 'forgot';

interface PendingContact {
  masked: string;
  email?: string;
  phone?: string;
}

/**
 * Instagram-style auth screen (login / signup) rendered inside the
 * restored macOS window chrome.
 *
 * Signup (owner spec 2026-10-19): username + password + REAL email OR
 * mobile number — whichever the user prefers. Verification happens once
 * at signup (email link / SMS OTP) and again only for password changes.
 * Login accepts the username, the email or the mobile number.
 * The password is hashed by Supabase Auth; legacy PBKDF2 accounts keep
 * working through the invisible migration path.
 */
export const AuthScreen: React.FC = () => {
  const { loginWithAccount, myGradient, deviceId, addLog } = useCrypto();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [avail, setAvail] = useState<'ok' | 'taken' | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [pending, setPending] = useState<PendingContact | null>(null);
  const [otp, setOtp] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

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

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError(null);
    setNeedsSetup(false);
    setAvail(null);
    if (m === 'login' || m === 'signup') {
      setPending(null);
      setOtp('');
      setForgotSent(false);
    }
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

    if (!supabase) {
      setError("This site isn't connected to its database yet.");
      setNeedsSetup(true);
      return;
    }

    if (mode === 'login') {
      if (!username.trim()) { setError('Enter your username, email or mobile number.'); return; }
      if (!password) { setError('Enter your password.'); return; }
      setBusy(true);
      try {
        const res = await loginAccount(supabase, username, password);
        if (!res.ok) {
          setError(res.error);
          if (isMissingTableError(res.error)) setNeedsSetup(true);
          return;
        }
        loginWithAccount({ username: res.account.username, accountId: res.account.id });
      } catch (err: any) {
        setError(err?.message || 'Something went wrong. Try again.');
      } finally {
        setBusy(false);
      }
      return;
    }

    // ---- signup ----
    const uError = validateUsername(username);
    if (uError) { setError(uError); return; }
    const cError = validateContact(contact);
    if (cError) { setError(cError); return; }
    if (!password) { setError('Enter your password.'); return; }

    setBusy(true);
    try {
      const res = await signupWithContact(supabase, username, password, contact, myGradient);
      if ('pending' in res && res.pending) {
        setPending({ masked: res.masked, email: (res as any).email, phone: (res as any).phone });
        setMode(res.pending === 'confirm_email' ? 'confirm' : 'otp');
        addLog(res.pending === 'confirm_email' ? 'Verification link sent' : 'SMS code sent');
        return;
      }
      if (!res.ok) {
        setError(res.error);
        if (isMissingTableError(res.error)) setNeedsSetup(true);
        return;
      }
      loginWithAccount({ username: res.account.username, accountId: res.account.id });
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !supabase || !pending?.phone) return;
    setError(null);
    setBusy(true);
    try {
      const res = await verifySignupOtp(supabase, pending.phone, otp, uClean, myGradient);
      if (!res.ok) { setError(res.error); return; }
      loginWithAccount({ username: res.account.username, accountId: res.account.id });
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (busy || !supabase || !pending?.email) return;
    setError(null);
    setBusy(true);
    try {
      const res = await resendContactConfirmation(supabase, pending.email);
      if (!res.ok) setError(res.error);
      else addLog('Verification link resent');
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !supabase) return;
    setError(null);
    setBusy(true);
    try {
      const res = await requestPasswordReset(supabase, forgotEmail);
      if (!res.ok) { setError(res.error); return; }
      setForgotSent(true);
      addLog('Password recovery email sent');
    } finally {
      setBusy(false);
    }
  };

  const contactKind = parseContact(contact)?.kind;

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
              <span className="hidden sm:inline text-cyan-500/90">
                {mode === 'forgot' ? 'RECOVERY' : 'SIGN IN'}
              </span>
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
                    Sign up with your email or mobile — verified once.<br />Private by default. No feeds. No noise.
                  </p>
                ) : mode === 'login' ? (
                  <p className="text-zinc-500 text-xs mt-2 text-center leading-relaxed">
                    Log in to your private messenger.
                  </p>
                ) : null}
              </div>

              {/* ---- ONE-TIME EMAIL CONFIRMATION ---- */}
              {mode === 'confirm' && pending ? (
                <div className="text-center space-y-5">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-cyan-300" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm">One-time check</div>
                    <p className="text-zinc-500 text-xs mt-2 leading-relaxed">
                      We sent a verification link to <span className="text-zinc-300 font-bold">{pending.masked}</span>.<br />
                      Tap it once — that's the only time we'll ask.
                    </p>
                  </div>
                  {error && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg text-left">
                      {error}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={busy}
                    className="w-full term-panel term-interactive py-2.5 rounded-lg text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-300 hover:text-cyan-300 border border-white/[0.07] transition-colors disabled:opacity-50"
                  >
                    {busy ? 'Sending…' : 'Resend the link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="text-xs text-cyan-400 font-bold hover:text-cyan-300 transition-colors"
                  >
                    I've verified — log in
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="block mx-auto text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to sign up</span>
                  </button>
                </div>
              ) : mode === 'otp' && pending ? (
                /* ---- SMS OTP ---- */
                <form onSubmit={handleVerifyOtp} className="space-y-4 text-center">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                    <Phone className="w-6 h-6 text-emerald-300" />
                  </div>
                  <p className="text-zinc-500 text-xs leading-relaxed">
                    Enter the code we texted to <span className="text-zinc-300 font-bold">{pending.masked}</span>.
                  </p>
                  <div className="term-input rounded-lg px-3 py-2.5 flex items-center gap-2.5 focus-within:border-cyan-400/60 transition-colors">
                    <KeyRound className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      type="text"
                      value={otp}
                      onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 8)); setError(null); }}
                      placeholder="6-digit code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600 tracking-[0.4em] text-center"
                      aria-label="Verification code"
                    />
                  </div>
                  {error && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg text-left">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check className="w-4 h-4" /> Verify and finish
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="block mx-auto text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to sign up</span>
                  </button>
                </form>
              ) : mode === 'forgot' ? (
                /* ---- FORGOT PASSWORD ---- */
                forgotSent ? (
                  <div className="text-center space-y-5">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                      <Mail className="w-6 h-6 text-cyan-300" />
                    </div>
                    <p className="text-zinc-500 text-xs leading-relaxed">
                      Recovery link sent to <span className="text-zinc-300 font-bold">{forgotEmail.replace(/^(.).*?(@.*)$/, '$1•••$2')}</span>.<br />
                      Open it on this device — it signs you in once so you can set a new password.
                    </p>
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="text-xs text-cyan-400 font-bold hover:text-cyan-300 transition-colors"
                    >
                      Back to log in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgot} className="space-y-3">
                    <p className="text-zinc-500 text-xs leading-relaxed text-center">
                      Enter the email you signed up with. We'll send a one-time link to set a new password.
                    </p>
                    <div className="term-input rounded-lg px-3 py-2.5 flex items-center gap-2.5 focus-within:border-cyan-400/60 transition-colors">
                      <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
                      <input
                        type="text"
                        value={forgotEmail}
                        onChange={e => { setForgotEmail(e.target.value); setError(null); }}
                        placeholder="your@email.com"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600"
                        aria-label="Recovery email"
                      />
                    </div>
                    {error && (
                      <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
                        {error}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={busy}
                      className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Mail className="w-4 h-4" /> Send recovery link
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="block mx-auto text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to log in</span>
                    </button>
                  </form>
                )
              ) : (
                /* ---- LOGIN / SIGNUP ---- */
                <form onSubmit={handleSubmit} className="space-y-3">
                  {/* identifier */}
                  <div className="term-input rounded-lg px-3 py-2.5 flex items-center gap-2.5 focus-within:border-cyan-400/60 transition-colors">
                    <AtSign className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      type="text"
                      value={username}
                      onChange={e => { setUsername(e.target.value.toLowerCase()); setError(null); }}
                      placeholder={mode === 'login' ? 'username, email or mobile' : 'username'}
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

                  {/* contact — email or mobile (signup only) */}
                  {mode === 'signup' && (
                    <>
                      <div className="term-input rounded-lg px-3 py-2.5 flex items-center gap-2.5 focus-within:border-cyan-400/60 transition-colors">
                        {contactKind === 'phone' ? (
                          <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
                        )}
                        <input
                          type="text"
                          value={contact}
                          onChange={e => { setContact(e.target.value); setError(null); }}
                          placeholder="email or mobile number"
                          inputMode="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          spellCheck={false}
                          className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600"
                          aria-label="Email or mobile number"
                        />
                      </div>
                      <div className="min-h-[18px] px-1 text-[11px] leading-snug text-zinc-600">
                        Verified once with a link or a text code. Used only for account security — never shown to anyone.
                      </div>
                    </>
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
                        One-time setup: the site owner needs to open the Supabase dashboard → SQL Editor and run
                        <code className="text-amber-200 mx-1">supabase/schema.sql</code> once to create the account tables.
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

                  {/* forgot password (login only) */}
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="block mx-auto text-[11px] text-zinc-500 hover:text-cyan-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </form>
              )}

              {/* mode switch */}
              {(mode === 'login' || mode === 'signup') && (
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
              )}

              {/* local escape hatch */}
              {!supabase && (
                <button
                  onClick={finishLocally}
                  className="mt-6 w-full term-panel term-interactive py-2.5 rounded-lg text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-400 hover:text-cyan-300 border border-white/[0.07] transition-colors"
                >
                  Continue in local mode
                </button>
              )}

              <SecurityNote className="mt-6" />
            </div>
          </div>

          {/* STATUS BAR */}
          <div className="term-statusbar shrink-0 border-t border-white/[0.07] flex items-center gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 md:px-6 lg:px-7 text-[8px] sm:text-[9px] md:text-[10px] font-bold tracking-widest uppercase select-none min-h-[28px] md:min-h-[32px]">
            <span className="flex items-center gap-1.5 shrink-0 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full dot-live" />
              <span className="hidden sm:inline">READY</span>
              <span className="sm:hidden">OK</span>
            </span>
            <span className="text-zinc-500 hidden sm:inline">PRIVATE BY DEFAULT · NO CHAT HISTORY KEPT</span>
            <div className="flex-1" />
            <span className="text-cyan-500/90 hidden md:inline">ID: {deviceId.substring(0, 8)}</span>
            <span className="text-emerald-500/90 tabular-nums shrink-0">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;

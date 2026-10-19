import React, { useEffect, useState } from 'react';
import {
  AtSign, Lock, Eye, EyeOff, UserPlus, LogIn, AlertTriangle, Check, X,
  Mail, Phone, KeyRound, ArrowLeft, ShieldCheck, LogOut,
} from 'lucide-react';
import { supabase, useCrypto } from '../../contexts/CryptoContext';
import SecurityNote from '../ui/SecurityNote';
import OtpInput from './OtpInput';
import {
  signupWithContact,
  verifySignupOtp,
  verifySignupEmailOtp,
  verifyRecoveryOtp,
  resendContactConfirmation,
  resendPhoneOtp,
  requestPasswordReset,
  completePasswordReset,
  validateContact,
  validateUsername,
  validatePassword,
  PASSWORD_MIN,
  usernameAvailable,
  isMissingTableError,
  loginAccount,
  parseContact,
} from '../../utils/auth';

type AuthMode = 'login' | 'signup' | 'otp' | 'verify' | 'forgot';

interface PendingContact {
  masked: string;
  email?: string;
  phone?: string;
}

const RESEND_SECONDS = 60;

/**
 * Instagram-style auth screen (login / signup) inside the macOS window
 * chrome. Axon Logs cyber-terminal theme preserved.
 *
 * Verification (master-prompt section 1): new accounts verify ONCE with a
 * SIX-DIGIT code sent to their real email (or SMS to their mobile). The
 * code is generated, expired and attempt-limited server-side by Supabase
 * Auth; this screen only collects it. Existing (legacy) accounts that
 * never verified are gated behind the same one-time check — they keep
 * their username, profile and conversations.
 *
 * Password rules (section 3): NO composition requirements — passphrases,
 * spaces and unicode all fine. Only the provider-grounded floor (8 chars)
 * and a 72-byte ceiling apply. Passwords are never trimmed.
 */
export const AuthScreen: React.FC = () => {
  const { loginWithAccount, myGradient, deviceId, addLog } = useCrypto();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [avail, setAvail] = useState<'ok' | 'taken' | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [pending, setPending] = useState<PendingContact | null>(null);
  const [otp, setOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // existing-account (legacy) one-time email verification
  const [verifyEmail, setVerifyEmail] = useState('');

  // forgot-password flow
  const [forgotStep, setForgotStep] = useState<'email' | 'code' | 'newpass' | 'done'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [rp1, setRp1] = useState('');
  const [rp2, setRp2] = useState('');
  const [showRp, setShowRp] = useState(false);
  const [signOutOthers, setSignOutOthers] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

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
      setForgotStep('email');
      setRecoveryCode('');
      setRp1(''); setRp2('');
      setVerifyEmail('');
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
          // Legacy account whose email was never verified → route into the
          // one-time verification instead of leaving the user stuck.
          if (res.needsVerification) {
            const parsed = parseContact(username.trim());
            if (parsed?.kind === 'email') {
              setVerifyEmail(parsed.email);
              setMode('verify');
              setResendIn(RESEND_SECONDS);
            }
          }
          return;
        }
        await bootstrapKeyring(res.account.username, password);
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
    const pError = validatePassword(password);
    if (pError) { setError(pError); return; }
    if (password !== confirmPassword) { setError("The two passwords don't match."); return; }

    setBusy(true);
    try {
      const res = await signupWithContact(supabase, username, password, contact, myGradient);
      if ('pending' in res && res.pending) {
        setPending({ masked: res.masked, email: (res as any).email, phone: (res as any).phone });
        setOtp('');
        setMode('otp');
        setResendIn(RESEND_SECONDS);
        addLog(res.pending === 'confirm_email' ? 'Verification code emailed' : 'SMS code sent');
        return;
      }
      if (!res.ok) {
        setError(res.error);
        if (isMissingTableError(res.error)) setNeedsSetup(true);
        return;
      }
      await bootstrapKeyring(res.account.username, password);
      loginWithAccount({ username: res.account.username, accountId: res.account.id });
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  /** Six-digit code verify — signup (email or SMS). Submit-on-complete. */
  const doSignupOtp = async (code: string) => {
    if (busy || !supabase || !pending) return;
    setError(null);
    setBusy(true);
    try {
      const res = pending.email
        ? await verifySignupEmailOtp(supabase, pending.email, code, uClean, myGradient)
        : await verifySignupOtp(supabase, pending.phone!, code, uClean, myGradient);
      if (!res.ok) { setError(res.error); return; }
      await bootstrapKeyring(res.account.username, password);
      loginWithAccount({ username: res.account.username, accountId: res.account.id });
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  /** Resend the pending signup code. */
  const handleResendSignup = async () => {
    if (busy || !supabase || !pending || resendIn > 0) return;
    setError(null);
    setBusy(true);
    try {
      const res = pending.email
        ? await resendContactConfirmation(supabase, pending.email)
        : await resendPhoneOtp(supabase, pending.phone!);
      if (!res.ok) setError(res.error);
      else { setResendIn(RESEND_SECONDS); setOtp(''); addLog('New code sent'); }
    } finally {
      setBusy(false);
    }
  };

  /** Existing-account one-time email verification (legacy gate). */
  const startVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !supabase) return;
    const parsed = parseContact(verifyEmail.trim());
    if (parsed?.kind !== 'email') { setError('Enter the email you registered with.'); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await resendContactConfirmation(supabase, parsed.email);
      if (!res.ok) setError(res.error);
      else {
        setVerifyEmail(parsed.email);
        setResendIn(RESEND_SECONDS);
        setPending({ masked: parsed.email.replace(/^(.).*?(@.*)$/, '$1•••$2'), email: parsed.email });
        setOtp('');
        setMode('otp');
        addLog('Verification code emailed');
      }
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
      setForgotStep('code');
      setResendIn(RESEND_SECONDS);
      setRecoveryCode('');
      addLog('Recovery code emailed');
    } finally {
      setBusy(false);
    }
  };

  const doRecoveryOtp = async (code: string) => {
    if (busy || !supabase) return;
    setError(null);
    setBusy(true);
    try {
      const res = await verifyRecoveryOtp(supabase, forgotEmail, code);
      if (!res.ok) { setError(res.error); return; }
      setForgotStep('newpass');
      addLog('Recovery code verified');
    } finally {
      setBusy(false);
    }
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !supabase) return;
    setError(null);
    const v = validatePassword(rp1);
    if (v) { setError(v); return; }
    if (rp1 !== rp2) { setError("The two passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await completePasswordReset(supabase, rp1, signOutOthers);
      if (!res.ok) { setError(res.error); return; }
      // Phase 5 / S3: re-wrap the keyring under the NEW password so existing
      // end-to-end chats keep opening on this device.
      try {
        const { hasActivePrivateKey, rewrapKeyring } = await import('../../utils/keyringService');
        if (hasActivePrivateKey()) {
          const uid = (await supabase.auth.getUser()).data.user?.id;
          const { data: acct } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', uid)
            .maybeSingle();
          if (acct?.username) {
            const rw = await rewrapKeyring(supabase, acct.username, rp1);
            if (rw.ok) addLog('Encryption key re-wrapped under the new password');
          }
        }
      } catch { /* best-effort re-wrap */ }
      setForgotStep('done');
      addLog(signOutOthers ? 'Password reset — other devices signed out' : 'Password reset');
    } finally {
      setBusy(false);
    }
  };

  const resendRecovery = async () => {
    if (busy || !supabase || resendIn > 0) return;
    setError(null);
    setBusy(true);
    try {
      const res = await requestPasswordReset(supabase, forgotEmail);
      if (!res.ok) setError(res.error);
      else { setResendIn(RESEND_SECONDS); setRecoveryCode(''); addLog('New recovery code sent'); }
    } finally {
      setBusy(false);
    }
  };

  const contactKind = parseContact(contact)?.kind;
  const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  /**
   * Phase 5 / S3: open (or create on first login) the account keyring with
   * the password already in hand. E2EE direct messages depend on it; legacy
   * chats are unaffected when this is skipped or fails.
   */
  const bootstrapKeyring = async (uname: string, pwd: string) => {
    if (!supabase) return;
    try {
      const { ensureKeyringForLogin } = await import('../../utils/keyringService');
      const res = await ensureKeyringForLogin(supabase, uname, pwd);
      if (res.status === 'ready' && res.created) {
        addLog('Encryption keyring created — direct messages are end-to-end encrypted');
      } else if (res.status === 'unwrap-failed') {
        addLog(`Encryption key unlock failed (${res.error}) — legacy chats still work`);
      }
    } catch {
      /* account_keys not provisioned yet — legacy key model applies */
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
              <span className="hidden sm:inline text-cyan-500/90">
                {mode === 'forgot' ? 'RECOVERY' : mode === 'otp' || mode === 'verify' ? 'VERIFY' : 'SIGN IN'}
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
                    Sign up with your email or mobile — verified once with a 6-digit code.<br />Private by default. No feeds. No noise.
                  </p>
                ) : mode === 'login' ? (
                  <p className="text-zinc-500 text-xs mt-2 text-center leading-relaxed">
                    Log in to your private messenger.
                  </p>
                ) : null}
              </div>

              {/* ---- SIX-DIGIT CODE (signup: email or SMS) ---- */}
              {mode === 'otp' && pending ? (
                <div className="space-y-4 text-center">
                  <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center ${pending.email ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
                    {pending.email ? <Mail className="w-6 h-6 text-cyan-300" /> : <Phone className="w-6 h-6 text-emerald-300" />}
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm">One-time check</div>
                    <p className="text-zinc-500 text-xs mt-2 leading-relaxed">
                      Enter the six-digit code we sent to{' '}
                      <span className="text-zinc-300 font-bold">{pending.masked}</span>.
                      {!pending.email && <><br />Codes by text work the same way.</>}
                    </p>
                    {pending.email && (
                      <p className="text-zinc-600 text-[11px] mt-1.5 leading-relaxed">
                        If your email shows a button or link instead of a code, tap it — verification completes either way.
                      </p>
                    )}
                  </div>
                  <OtpInput
                    value={otp}
                    onChange={v => { setOtp(v); setError(null); }}
                    onComplete={doSignupOtp}
                    disabled={busy}
                    error={!!error}
                  />
                  {error && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg text-left" role="alert">
                      {error}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => doSignupOtp(otp)}
                    disabled={busy || otp.length !== 6}
                    className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check className="w-4 h-4" /> {busy ? 'Checking…' : 'Verify and finish'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResendSignup}
                    disabled={busy || resendIn > 0}
                    className="w-full term-panel term-interactive py-2.5 rounded-lg text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-300 hover:text-cyan-300 border border-white/[0.07] transition-colors disabled:opacity-50"
                  >
                    {resendIn > 0 ? `Resend available in ${resendIn}s` : 'Send a new code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="block mx-auto text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to sign up</span>
                  </button>
                </div>
              ) : mode === 'verify' ? (
                /* ---- LEGACY ACCOUNT ONE-TIME EMAIL VERIFICATION ---- */
                <form onSubmit={startVerify} className="space-y-4 text-center">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-cyan-300" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm">Verify your email — once</div>
                    <p className="text-zinc-500 text-xs mt-2 leading-relaxed">
                      This account hasn't finished its one-time email check. Enter the email you
                      registered with and we'll send a six-digit code. Your username, profile and
                      conversations all stay exactly as they are.
                    </p>
                  </div>
                  <div className="term-input rounded-lg px-3 py-2.5 flex items-center gap-2.5 focus-within:border-cyan-400/60 transition-colors">
                    <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      type="text"
                      value={verifyEmail}
                      onChange={e => { setVerifyEmail(e.target.value); setError(null); }}
                      placeholder="your@email.com"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600"
                      aria-label="Registered email"
                    />
                  </div>
                  {error && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg text-left" role="alert">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" /> Email me a code
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="block mx-auto text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to log in</span>
                  </button>
                </form>
              ) : mode === 'forgot' ? (
                /* ---- FORGOT PASSWORD (3 steps: email → code → new password) ---- */
                forgotStep === 'email' ? (
                  <form onSubmit={handleForgot} className="space-y-3">
                    <p className="text-zinc-500 text-xs leading-relaxed text-center">
                      Enter the email you signed up with. We'll send a one-time six-digit code to set a new password.
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
                      <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg" role="alert">
                        {error}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={busy}
                      className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Mail className="w-4 h-4" /> Send recovery code
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="block mx-auto text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to log in</span>
                    </button>
                  </form>
                ) : forgotStep === 'code' ? (
                  <div className="space-y-4 text-center">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                      <KeyRound className="w-6 h-6 text-cyan-300" />
                    </div>
                    <p className="text-zinc-500 text-xs leading-relaxed">
                      Enter the six-digit recovery code sent to{' '}
                      <span className="text-zinc-300 font-bold">{forgotEmail.replace(/^(.).*?(@.*)$/, '$1•••$2')}</span>.
                      It works once and expires soon.
                    </p>
                    <OtpInput
                      value={recoveryCode}
                      onChange={v => { setRecoveryCode(v); setError(null); }}
                      onComplete={doRecoveryOtp}
                      disabled={busy}
                      error={!!error}
                    />
                    {error && (
                      <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg text-left" role="alert">
                        {error}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => doRecoveryOtp(recoveryCode)}
                      disabled={busy || recoveryCode.length !== 6}
                      className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="w-4 h-4" /> {busy ? 'Checking…' : 'Verify code'}
                    </button>
                    <button
                      type="button"
                      onClick={resendRecovery}
                      disabled={busy || resendIn > 0}
                      className="w-full term-panel term-interactive py-2.5 rounded-lg text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-300 hover:text-cyan-300 border border-white/[0.07] transition-colors disabled:opacity-50"
                    >
                      {resendIn > 0 ? `Resend available in ${resendIn}s` : 'Send a new code'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setForgotStep('email'); setError(null); }}
                      className="block mx-auto text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Wrong email? Go back</span>
                    </button>
                  </div>
                ) : forgotStep === 'newpass' ? (
                  <form onSubmit={handleNewPassword} className="space-y-3">
                    <div className="text-white font-bold text-sm text-center">Set a new password</div>
                    <p className="text-zinc-500 text-xs leading-relaxed text-center">
                      No rules — passphrases welcome. At least {PASSWORD_MIN} characters.
                    </p>
                    <div className="term-input rounded-lg px-3 py-2.5 flex items-center gap-2.5 focus-within:border-cyan-400/60 transition-colors">
                      <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                      <input
                        type={showRp ? 'text' : 'password'}
                        value={rp1}
                        onChange={e => { setRp1(e.target.value); setError(null); }}
                        placeholder="New password"
                        autoComplete="new-password"
                        className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600"
                        aria-label="New password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRp(v => !v)}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                        tabIndex={-1}
                        aria-label={showRp ? 'Hide new password' : 'Show new password'}
                      >
                        {showRp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="term-input rounded-lg px-3 py-2.5 flex items-center gap-2.5 focus-within:border-cyan-400/60 transition-colors">
                      <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                      <input
                        type={showRp ? 'text' : 'password'}
                        value={rp2}
                        onChange={e => { setRp2(e.target.value); setError(null); }}
                        placeholder="Repeat the new password"
                        autoComplete="new-password"
                        className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600"
                        aria-label="Repeat the new password"
                      />
                    </div>
                    {rp2.length > 0 && rp1 !== rp2 && (
                      <div className="px-1 text-[11px] text-red-400">The two passwords don't match yet.</div>
                    )}
                    <label className="flex items-start gap-2.5 px-1 py-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={signOutOthers}
                        onChange={e => setSignOutOthers(e.target.checked)}
                        className="mt-0.5 accent-cyan-400"
                      />
                      <span className="text-[11px] text-zinc-400 leading-snug flex items-start gap-1.5">
                        <LogOut className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-500" />
                        Log out other devices after the reset (recommended — this one stays signed in).
                      </span>
                    </label>
                    {error && (
                      <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg" role="alert">
                        {error}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={busy || !rp1 || !rp2}
                      className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="w-4 h-4" /> {busy ? 'Saving…' : 'Save new password'}
                    </button>
                  </form>
                ) : (
                  <div className="text-center space-y-5">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                      <Check className="w-6 h-6 text-emerald-300" />
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm">Password updated</div>
                      <p className="text-zinc-500 text-xs mt-2 leading-relaxed">
                        {signOutOthers
                          ? 'Your other devices were signed out. This device keeps its session.'
                          : 'Your new password works everywhere from now on.'}{' '}
                        The recovery code is now dead — it can't be reused.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="btn-premium w-full py-2.5 rounded-lg flex items-center justify-center gap-2"
                    >
                      <LogIn className="w-4 h-4" /> Log in with the new password
                    </button>
                  </div>
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
                        Verified once with a six-digit code. Used only for account security — never shown to anyone.
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

                  {/* confirm password (signup only) */}
                  {mode === 'signup' && (
                    <>
                      <div className="term-input rounded-lg px-3 py-2.5 flex items-center gap-2.5 focus-within:border-cyan-400/60 transition-colors">
                        <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                        <input
                          type={showPass ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={e => { setConfirmPassword(e.target.value); setError(null); }}
                          placeholder="repeat the password"
                          autoComplete="new-password"
                          className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600"
                          aria-label="Repeat the password"
                        />
                      </div>
                      <div className="min-h-[16px] px-1 text-[11px] leading-snug">
                        {confirmMismatch ? (
                          <span className="text-red-400 flex items-center gap-1">
                            <X className="w-3 h-3 shrink-0" /> The two passwords don't match yet.
                          </span>
                        ) : confirmPassword ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <Check className="w-3 h-3 shrink-0" /> They match.
                          </span>
                        ) : (
                          <span className="text-zinc-600">No character rules — passphrases welcome. {PASSWORD_MIN}+ characters.</span>
                        )}
                      </div>
                    </>
                  )}

                  {error && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg" role="alert">
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

import { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react';
import { supabase, useCrypto } from '../../contexts/CryptoContext';
import { hasActivePrivateKey } from '../../utils/chatCrypto';
import { trySilentUnlock, unlockKeyringWithPassword } from '../../utils/keyringService';

const SKIP_FLAG = 'axon_keyring_gate_dismissed';

/**
 * Phase 5 / S3 — keyring unlock gate.
 *
 * After a session restore on a NEW browser there is no device-held private
 * key yet (the key lives only wrapped under the account password). This
 * gate asks for the password ONCE, unwraps the keyring in memory and keeps
 * a device-wrapped copy in IndexedDB. The password is never stored; the
 * plaintext private key never leaves WebCrypto memory.
 *
 * Skippable: legacy chats keep working without the key; only end-to-end
 * encrypted DMs stay locked until the key is opened.
 */
const KeyringGate: React.FC = () => {
  const { account, backendMode, addLog } = useCrypto();
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u = account?.username;
    if (!u || backendMode !== 'online') return;
    if (hasActivePrivateKey()) return;
    if (sessionStorage.getItem(SKIP_FLAG) === '1') return;
    let cancelled = false;
    (async () => {
      const res = await trySilentUnlock(u);
      if (cancelled) return;
      if (res.status === 'need-password') {
        // Only gate when a keyring actually exists — brand-new accounts and
        // users who never logged in since the upgrade have nothing to open.
        try {
          const { data } = await supabase!
            .from('account_keys')
            .select('username')
            .eq('username', u.toLowerCase())
            .maybeSingle();
          if (!cancelled && data) setNeedsUnlock(true);
        } catch {
          /* table missing — nothing to gate */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.username, backendMode]);

  if (!needsUnlock) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !account) return;
    if (!password) {
      setError('Enter your account password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await unlockKeyringWithPassword(supabase, account.username, password);
      if (res.status === 'ready') {
        sessionStorage.setItem(SKIP_FLAG, '1');
        addLog('Encryption key opened — end-to-end chats are readable again');
        window.location.reload(); // re-decrypt with the key in place
        return;
      }
      setError("That password didn't open the encryption key.");
    } catch {
      setError('Could not open the key right now. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    sessionStorage.setItem(SKIP_FLAG, '1');
    setNeedsUnlock(false);
    addLog('Key unlock skipped — end-to-end chats stay locked on this device');
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0c12] p-5 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-9 h-9 rounded-xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
            <KeyRound className="w-4.5 h-4.5 text-cyan-300" />
          </span>
          <div>
            <h2 className="text-white text-sm font-semibold">Open your encryption key</h2>
            <p className="text-zinc-500 text-[11px]">One time on this device</p>
          </div>
        </div>
        <p className="text-zinc-400 text-xs leading-relaxed mb-4">
          Your end-to-end encrypted chats are sealed with a key only your devices
          hold. Enter your account password to open it here — the password is used
          in memory and never saved.
        </p>
        <form onSubmit={handleUnlock} className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Account password"
              autoFocus
              autoComplete="current-password"
              className="w-full rounded-xl bg-black/40 border border-white/10 pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400/50"
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black text-sm font-semibold py-2.5 transition-colors"
          >
            {busy ? 'Opening…' : 'Open key'}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="w-full rounded-xl border border-white/10 text-zinc-400 hover:text-zinc-200 text-xs py-2 transition-colors"
          >
            Not now — regular chats still work
          </button>
        </form>
      </div>
    </div>
  );
};

export default KeyringGate;

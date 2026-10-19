import React, { useState, useRef } from 'react';
import {
  Settings,
  Download,
  Upload,
  AlertTriangle,
  ShieldAlert,
  ToggleRight,
  ToggleLeft,
  UserCheck,
  KeyRound,
  Check,
  X,
  ChevronRight,
  Monitor,
  BellRing,
  Cloud,
  CloudOff,
  RefreshCw,
  Flame,
  Timer,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useCrypto, BURN_DELAY_OPTIONS } from '../../contexts/CryptoContext';
import SecurityNote from '../ui/SecurityNote';
import { supabase } from '../../contexts/CryptoContext';
import { getNotifPrefs, setNotifPrefs, type NotifPrefs } from '../../utils/notifications';
import { fetchAccount, fetchFollowers, fetchFollowing, fetchBlockedUsers, verifyCurrentPassword } from '../../utils/auth';
import {
  exportAppData,
  exportPdfData,
  importAppData,
  resetAllLocalData,
} from '../../utils/dataManager';

const burnLabel = (seconds: number) =>
  seconds >= 3600 ? `${Math.round(seconds / 3600)}H` : seconds >= 60 ? `${Math.round(seconds / 60)}M` : `${seconds}S`;

export interface SettingsPanelProps {
  onBack?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onBack }) => {
  const { textSize, cardPadding, borderRadius, setTextSize, setCardPadding, setBorderRadius } = useTheme();
  const { alias, deviceId, updateAlias, addLog, backendMode, networkStatus, pushLocalToCloud, settings, updateSettings, simBotActive, toggleSimBot, logout, account } = useCrypto();

  const [aliasInput, setAliasInput] = useState(alias);
  const [decoyPassphrase, setDecoyPassphrase] = useState(() => localStorage.getItem('axon_decoy_pass') || 'DECOY123');
  const [syncing, setSyncing] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [notifPrefs, setNotifPrefsState] = useState<NotifPrefs>(() => getNotifPrefs());
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('axon_sound_enabled') !== 'false');
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('axon_notifications_enabled') === 'true');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const handleAliasSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aliasInput.trim()) return;
    updateAlias(aliasInput.trim());
    showStatus('success', `Name updated to ${aliasInput.trim()}`);
  };

  const handleExportJson = () => {
    try {
      exportAppData();
      addLog('Exported JSON data archive.');
      showStatus('success', 'Backup file downloaded');
    } catch (err: any) {
      showStatus('error', `Download failed: ${err.message}`);
    }
  };

  const handleExportPdf = () => {
    try {
      exportPdfData();
      addLog('Exported PDF log report.');
      showStatus('success', 'PDF file downloaded');
    } catch (err: any) {
      showStatus('error', `PDF download failed: ${err.message}`);
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const result = importAppData(content);
      if (result.success) {
        addLog('Imported JSON data backup.');
        showStatus('success', 'Backup restored — reloading…');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        showStatus('error', `Restore failed: ${result.error}`);
      }
    };
    reader.onerror = () => {
      showStatus('error', "Couldn't read that file");
    };
    reader.readAsText(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSoundToggle = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('axon_sound_enabled', next ? 'true' : 'false');
    addLog(next ? 'Message sound on' : 'Message sound off');
  };

  const handleNotificationsToggle = () => {
    const next = !notificationsEnabled;
    if (next && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          setNotificationsEnabled(true);
          localStorage.setItem('axon_notifications_enabled', 'true');
          addLog('Desktop notifications enabled');
        } else {
          addLog('Desktop notifications permission denied');
        }
      });
      return;
    }
    setNotificationsEnabled(next);
    localStorage.setItem('axon_notifications_enabled', next ? 'true' : 'false');
    addLog(next ? 'Desktop notifications enabled' : 'Desktop notifications disabled');
  };

  const handlePushToCloud = async () => {
    if (backendMode !== 'online') {
      showStatus('error', 'Not connected — run supabase/schema.sql first');
      return;
    }
    setSyncing(true);
    const pushed = await pushLocalToCloud();
    setSyncing(false);
    if (pushed > 0) {
      addLog(`Uploaded ${pushed} local chat(s) to the cloud`);
      showStatus('success', `Uploaded ${pushed} chat(s) to the cloud`);
    } else {
      showStatus('success', 'Everything is already synced');
    }
  };

  /* ---------------- account lifecycle (Supabase Auth) ---------------- */

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || backendMode !== 'online') {
      showStatus('error', 'You need the cloud connection to change your password.');
      return;
    }
    // Owner spec: the password change is verified with the current password
    // (re-auth inside the existing session) before anything is updated.
    const verified = await verifyCurrentPassword(supabase, currentPassword);
    if (!verified.ok) {
      showStatus('error', verified.error);
      return;
    }
    if (newPassword.length < 6) {
      showStatus('error', 'Choose a password with at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showStatus('error', "The two passwords don't match.");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      showStatus('error', error.message || 'Could not change the password.');
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setCurrentPassword('');
    addLog('Account password changed');
    showStatus('success', 'Password updated');
  };

  const handleLogoutEverywhere = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch {
      /* even a local sign-out keeps the account safe */
    }
    logout();
  };

  const handleExportAccountData = async () => {
    if (!supabase || !account) {
      showStatus('error', 'Connect to the cloud first.');
      return;
    }
    setExportingData(true);
    try {
      const u = account.username;
      const [profile, followers, following, blockedList] = await Promise.all([
        fetchAccount(supabase, u),
        fetchFollowers(supabase, u),
        fetchFollowing(supabase, u),
        fetchBlockedUsers(supabase, u),
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        product: 'Axon Logs',
        profile,
        followers,
        following,
        blocked: blockedList,
        notification_preferences: getNotifPrefs(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `axonlogs-account-${u}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('success', 'Account data downloaded');
    } catch (err: any) {
      showStatus('error', `Export failed: ${err.message}`);
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!supabase || !account || deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    const u = account.username;
    try {
      // Best-effort content cleanup within RLS: my follows + notifications
      // + messages stay (chats are shared); profile gets anonymized.
      await supabase.from('follows').delete().eq('follower', u);
      await supabase.from('follows').delete().eq('followed', u);
      await supabase.from('notifications').delete().eq('username', u);
      await supabase
        .from('accounts')
        .update({
          bio: 'This account has been deleted.',
          display_name: 'Deleted account',
          avatar_url: '',
          avatar_gradient: '',
          show_activity: false,
          is_private: true,
        })
        .eq('username', u);
      try { await supabase.auth.signOut({ scope: 'global' }); } catch { /* noop */ }
      logout();
    } catch (err: any) {
      showStatus('error', err?.message || 'Deletion failed — try again.');
    }
  };

  const toggleNotifPref = (key: keyof NotifPrefs) => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefsState(next);
    setNotifPrefs(next);
    addLog(`Notification preference: ${key} ${next[key] ? 'on' : 'off'}`);
  };

  const handleConfirmReset = () => {
    try {
      resetAllLocalData();
      showStatus('success', 'Everything cleared. Reloading…');
      setShowResetModal(false);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      showStatus('error', `Couldn't clear data: ${err.message}`);
    }
  };

  // Card with a left accent bar + in-card header (icon + uppercase title + divider),
  // matching the reference dashboard styling.
  const SectionCard = ({ icon: Icon, title, accent = 'bg-cyan-500', children }: { icon: any, title: string, accent?: string, children: React.ReactNode }) => (
    <div className="relative bg-gradient-to-b from-[#0b0b13] to-[#08080d] border border-white/[0.07] rounded-xl overflow-hidden mb-6 shadow-sm">
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accent} shadow-[0_0_12px_-2px_currentColor]`} />
      <div className="flex items-center gap-2 px-5 pt-4 pb-3 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400 border-b border-white/[0.06]">
        <Icon className="w-3.5 h-3.5 shrink-0" /> {title}
      </div>
      {children}
    </div>
  );

  const SettingRow = ({ title, desc, children, isButton = false, onClick }: { title: string, desc: string, children?: React.ReactNode, isButton?: boolean, onClick?: () => void }) => {
    const Comp = isButton ? 'button' : 'div';
    return (
      <Comp
        onClick={onClick}
        className={`w-full flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 md:px-5 py-4 border-b border-zinc-800/50 last:border-0 ${isButton ? 'hover:bg-white/[0.02] transition-colors text-left cursor-pointer' : ''}`}
      >
        <div className="pr-4 min-w-0 flex-1">
          <div className="theme-text font-semibold text-zinc-100 tracking-wide truncate">{title}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed uppercase tracking-wider">{desc}</div>
        </div>
        <div className="shrink-0 flex items-center justify-end">
          {children}
        </div>
      </Comp>
    );
  };

  const SegmentedControl = ({ options, current, onChange }: { options: string[], current: string, onChange: (val: any) => void }) => (
    <div className="flex bg-[#050505] border border-zinc-800/80 rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest uppercase transition-colors ${
            current === opt
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  const syncOnline = backendMode === 'online';

  return (
    <div className="flex-1 flex flex-col h-full glass-panel theme-text text-[#a3a3a3] font-mono overflow-y-auto">

      {/* Header Sticky Bar */}
      <div className="sticky top-0 z-10 bg-[#08080f] border-b border-white/[0.06] px-4 py-4 md:px-6 md:p-6 flex justify-between items-center gap-4 hairline-gradient">
        <div className="min-w-0 flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 text-zinc-400 hover:text-cyan-300 transition-colors shrink-0"
              title="Back"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
          )}
          <h1 className="text-xl font-bold tracking-[0.2em] uppercase flex items-center gap-3">
            <Settings className="w-5 h-5 text-cyan-400 shrink-0" /> <span className="text-gradient">Settings</span>
          </h1>
        </div>
        {statusMessage && (
          <div className={`px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded border flex items-center gap-2 shrink-0 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-red-500/10 border-red-500/40 text-red-400'
          }`}>
            {statusMessage.type === 'success' ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            <span className="truncate">{statusMessage.text}</span>
          </div>
        )}
      </div>

      <div className="p-4 md:p-6 max-w-4xl space-y-2">

        {/* SYNC & STORAGE */}
        <SectionCard icon={Cloud} title="Sync & storage" accent={syncOnline ? 'bg-emerald-500' : 'bg-amber-500'}>
          <SettingRow
            title={syncOnline ? 'Synced to the cloud' : 'This device only'}
            desc={syncOnline
              ? `Your chats are saved online and show up on every device (${networkStatus})`
              : 'Your chats are saved on this device only — the site isn\'t connected to its database yet'}
          >
            {syncOnline ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold tracking-widest uppercase">
                <Cloud className="w-3 h-3" /> SYNCED
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/40 text-amber-400 text-[10px] font-bold tracking-widest uppercase">
                <CloudOff className="w-3 h-3" /> LOCAL
              </span>
            )}
          </SettingRow>
          <SettingRow title="Upload this device's chats" desc="Copy chats saved on this device to the cloud" isButton onClick={handlePushToCloud}>
            {syncing
              ? <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
              : <ChevronRight className="w-4 h-4 text-emerald-500/60" />}
          </SettingRow>
          {!syncOnline && (
            <SettingRow
              title="Practice bot"
              desc="A demo contact that replies, so you can try the chat"
            >
              <button
                onClick={() => toggleSimBot()}
                className={`px-3 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase border transition-colors ${
                  simBotActive
                    ? 'bg-amber-500 text-black border-amber-500'
                    : 'text-amber-400 border-amber-500/40 hover:bg-amber-500/10'
                }`}
              >
                {simBotActive ? 'ON' : 'OFF'}
              </button>
            </SettingRow>
          )}
          {!syncOnline && (
            <div className="px-5 py-3 bg-amber-500/5 border-t border-amber-500/20 text-[10px] text-amber-500/90 tracking-wider uppercase leading-relaxed">
              Setup needed: run <span className="font-bold text-amber-400">supabase/schema.sql</span> once in your Supabase dashboard to turn on cloud sync.
            </div>
          )}
        </SectionCard>

        {/* IDENTITY */}
        <SectionCard icon={UserCheck} title="You & this device" accent="bg-cyan-500">
          <SettingRow title="Local nickname" desc="A private nickname for you, shown only on this device">
            <form onSubmit={handleAliasSave} className="flex items-center gap-2">
              <input
                type="text"
                value={aliasInput}
                onChange={e => setAliasInput(e.target.value)}
                placeholder="Your nickname"
                className="bg-[#050505] border border-zinc-800 focus:border-cyan-500 px-3 py-1.5 text-cyan-400 font-mono text-xs outline-none rounded-md text-right w-40 transition-colors"
              />
              <button type="submit" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-1.5 rounded-md transition-colors">
                <Check className="w-4 h-4" />
              </button>
            </form>
          </SettingRow>
          <SettingRow title="Device ID" desc="A random ID for this device — used to keep your stuff separate">
            <div className="bg-[#050505] border border-zinc-800 px-3 py-1.5 text-zinc-500 font-mono text-[10px] rounded-md select-all">
              {deviceId || 'UNKNOWN'}
            </div>
          </SettingRow>
        </SectionCard>

        {/* ACCOUNT (Supabase Auth lifecycle) */}
        <SectionCard icon={KeyRound} title="Account" accent="bg-emerald-500">
          <SettingRow title="Signed in as" desc="Your account username">
            <div className="bg-[#050505] border border-zinc-800 px-3 py-1.5 text-emerald-400 font-mono text-[10px] rounded-md select-all">
              @{account?.username || alias || '—'}
            </div>
          </SettingRow>
          <div className="px-5 pb-4">
            <form onSubmit={handleChangePassword} className="space-y-2">
              <label className="block text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase">Change password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Current password — proves it's you"
                autoComplete="current-password"
                className="w-full bg-[#050505] border border-zinc-800 focus:border-emerald-500 px-3 py-2 text-white text-xs outline-none rounded-md transition-colors"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password (6+ characters)"
                  autoComplete="new-password"
                  className="bg-[#050505] border border-zinc-800 focus:border-emerald-500 px-3 py-2 text-white text-xs outline-none rounded-md transition-colors"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat the new password"
                  autoComplete="new-password"
                  className="bg-[#050505] border border-zinc-800 focus:border-emerald-500 px-3 py-2 text-white text-xs outline-none rounded-md transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="w-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 py-2 rounded-md text-[10px] font-bold tracking-widest uppercase transition-colors disabled:opacity-40"
              >
                {changingPassword ? 'Updating…' : 'Verify and update password'}
              </button>
            </form>
          </div>
          <SettingRow title="Log out everywhere" desc="Sign this account out on every device it's logged into" isButton onClick={handleLogoutEverywhere}>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </SettingRow>
          <SettingRow title={exportingData ? "Preparing your file…" : "Download my account data"} desc="Profile, followers, following and blocked accounts as a JSON file" isButton onClick={handleExportAccountData}>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </SettingRow>
          <SettingRow title="Delete account" desc="Anonymize the profile and wipe its content — this can't be undone" isButton onClick={() => { setDeleteConfirmText(''); setShowDeleteAccountModal(true); }}>
            <ChevronRight className="w-4 h-4 text-red-500/50" />
          </SettingRow>
        </SectionCard>

        {/* PRIVACY & SAFETY */}
        <SectionCard icon={ShieldAlert} title="Privacy & safety" accent="bg-blue-500">
          <SettingRow title="Stealth mode" desc="Blur your chats while the tab is hidden">
            <button
              onClick={() => {
                updateSettings({ stealthMode: !settings.stealthMode });
                addLog(settings.stealthMode ? 'Stealth mode disabled' : 'Stealth mode enabled (feed obfuscated on tab hide)');
              }}
            >
              {settings.stealthMode ? <ToggleRight className="text-blue-400 w-8 h-8" /> : <ToggleLeft className="text-zinc-700 w-8 h-8" />}
            </button>
          </SettingRow>
          {/* Instagram privacy toggles */}
          <SettingRow title="Read Receipts" desc="Show 'Seen' when you've read messages">
            <button
              onClick={() => {
                updateSettings({ readReceipts: settings.readReceipts === false });
                addLog(settings.readReceipts === false ? 'Read receipts enabled' : 'Read receipts disabled');
              }}
            >
              {settings.readReceipts === false ? <ToggleLeft className="text-zinc-700 w-8 h-8" /> : <ToggleRight className="text-blue-400 w-8 h-8" />}
            </button>
          </SettingRow>
          <SettingRow title="Activity Status" desc="Let people see when you're active">
            <button
              onClick={() => {
                updateSettings({ showActivity: settings.showActivity === false });
                addLog(settings.showActivity === false ? 'Activity status shown' : 'Activity status hidden');
              }}
            >
              {settings.showActivity === false ? <ToggleLeft className="text-zinc-700 w-8 h-8" /> : <ToggleRight className="text-blue-400 w-8 h-8" />}
            </button>
          </SettingRow>
          <SettingRow title="Private Account" desc="Follow requests need your approval">
            <button
              onClick={() => {
                updateSettings({ privateAccount: settings.privateAccount === false });
                addLog(settings.privateAccount === false ? 'Account set to PRIVATE' : 'Account set to public');
              }}
            >
              {settings.privateAccount === false ? <ToggleLeft className="text-zinc-700 w-8 h-8" /> : <ToggleRight className="text-blue-400 w-8 h-8" />}
            </button>
          </SettingRow>
          <SettingRow title="Decoy password" desc="Typing this secret password at the unlock screen opens a fake notes page instead of your chats">
            <input
              type="text"
              value={decoyPassphrase}
              onChange={e => {
                const v = e.target.value.toUpperCase();
                setDecoyPassphrase(v);
                localStorage.setItem('axon_decoy_pass', v);
              }}
              className="bg-[#050505] border border-zinc-800 focus:border-blue-500 px-3 py-1.5 text-blue-400 font-mono text-xs outline-none uppercase rounded-md text-right w-48 transition-colors"
            />
          </SettingRow>
          <SecurityNote compact className="mx-5 mb-4 mt-1" />
        </SectionCard>

        {/* MESSAGES */}
        <SectionCard icon={Flame} title="Messages" accent="bg-cyan-500">
          <SettingRow
            title="Vanishing messages"
            desc={settings.burnOnRead
              ? `New messages disappear ${burnLabel(settings.burnDelaySeconds)} after they're read`
              : "Off — messages stay until they're deleted"}
          >
            <button
              onClick={() => {
                updateSettings({ burnOnRead: !settings.burnOnRead });
                addLog(settings.burnOnRead ? 'Auto message delete disabled' : `Auto message delete enabled (${burnLabel(settings.burnDelaySeconds)})`);
              }}
            >
              {settings.burnOnRead ? <ToggleRight className="text-cyan-400 w-8 h-8" /> : <ToggleLeft className="text-zinc-700 w-8 h-8" />}
            </button>
          </SettingRow>
          {settings.burnOnRead && (
            <div className="px-5 py-4 border-b border-zinc-800/50">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-2.5">
                <Timer className="w-3 h-3 text-cyan-500/70" /> Vanish timer
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BURN_DELAY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      updateSettings({ burnDelaySeconds: opt.value });
                      addLog(`Auto-delete timer set to ${burnLabel(opt.value)}`);
                    }}
                    className={`px-3.5 py-1.5 rounded-md text-[10px] font-bold tracking-widest uppercase border transition-colors ${
                      settings.burnDelaySeconds === opt.value
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                        : 'bg-[#050505] border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[9px] text-zinc-600 uppercase tracking-wider">
                Applies to all chats on this device
              </div>
            </div>
          )}
          <SettingRow title="Files & photos" desc="Let you send files and photos in chats">
            <button
              onClick={() => {
                updateSettings({ allowFiles: !settings.allowFiles });
                addLog(settings.allowFiles ? 'File attachments disabled' : 'File attachments enabled');
              }}
            >
              {settings.allowFiles ? <ToggleRight className="text-cyan-400 w-8 h-8" /> : <ToggleLeft className="text-zinc-700 w-8 h-8" />}
            </button>
          </SettingRow>
          <SettingRow title="Voice messages" desc="Let you record and send voice notes">
            <button
              onClick={() => {
                updateSettings({ allowVoice: !settings.allowVoice });
                addLog(settings.allowVoice ? 'Voice messages disabled' : 'Voice messages enabled');
              }}
            >
              {settings.allowVoice ? <ToggleRight className="text-cyan-400 w-8 h-8" /> : <ToggleLeft className="text-zinc-700 w-8 h-8" />}
            </button>
          </SettingRow>
        </SectionCard>

        {/* NOTIFICATIONS */}
        <SectionCard icon={BellRing} title="Notifications" accent="bg-amber-500">
          <SettingRow title="Message sound" desc="Play a sound when a new message arrives">
            <button onClick={handleSoundToggle}>
              {soundEnabled ? <ToggleRight className="text-amber-400 w-8 h-8" /> : <ToggleLeft className="text-zinc-700 w-8 h-8" />}
            </button>
          </SettingRow>
          <SettingRow title="Desktop notifications" desc="Get a system notification for new messages while the tab is hidden">
            <button onClick={handleNotificationsToggle}>
              {notificationsEnabled ? <ToggleRight className="text-amber-400 w-8 h-8" /> : <ToggleLeft className="text-zinc-700 w-8 h-8" />}
            </button>
          </SettingRow>
          <SettingRow title="New followers" desc="Follows, follow requests and accepted requests">
            <button onClick={() => toggleNotifPref('follows')}>
              {notifPrefs.follows ? <ToggleRight className="text-amber-400 w-8 h-8" /> : <ToggleLeft className="text-zinc-700 w-8 h-8" />}
            </button>
          </SettingRow>
          <SettingRow title="Chat requests" desc="When someone wants to message you">
            <button onClick={() => toggleNotifPref('messages')}>
              {notifPrefs.messages ? <ToggleRight className="text-amber-400 w-8 h-8" /> : <ToggleLeft className="text-zinc-700 w-8 h-8" />}
            </button>
          </SettingRow>
          <SettingRow title="Calls" desc="Incoming and missed call alerts">
            <button onClick={() => toggleNotifPref('calls')}>
              {notifPrefs.calls ? <ToggleRight className="text-amber-400 w-8 h-8" /> : <ToggleLeft className="text-zinc-700 w-8 h-8" />}
            </button>
          </SettingRow>
        </SectionCard>

        {/* LOOK & FEEL */}
        <SectionCard icon={Monitor} title="Look & feel" accent="bg-purple-500">
          <SettingRow title="Text size" desc="Make text smaller or bigger">
            <SegmentedControl options={['small', 'medium', 'large']} current={textSize} onChange={setTextSize} />
          </SettingRow>
          <SettingRow title="Spacing" desc="How much breathing room cards get">
            <SegmentedControl options={['compact', 'normal', 'relaxed']} current={cardPadding} onChange={setCardPadding} />
          </SettingRow>
          <SettingRow title="Corner rounding" desc="Shape of buttons and cards">
            <SegmentedControl options={['sharp', 'rounded', 'pill']} current={borderRadius} onChange={setBorderRadius} />
          </SettingRow>
        </SectionCard>

        {/* EXPORT */}
        <SectionCard icon={Download} title="Export" accent="bg-emerald-500">
          <SettingRow title="Download everything as PDF" desc="Save your chat history as a PDF file" isButton onClick={handleExportPdf}>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </SettingRow>
          <SettingRow title="Download a backup file" desc="Save your chats and settings as a JSON backup" isButton onClick={handleExportJson}>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </SettingRow>
        </SectionCard>

        {/* IMPORT */}
        <SectionCard icon={Upload} title="Import" accent="bg-fuchsia-500">
          <SettingRow title="Restore a backup" desc="Bring your chats back from a backup file" isButton onClick={() => fileInputRef.current?.click()}>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </SettingRow>
          <input type="file" accept=".json,application/json" ref={fileInputRef} onChange={handleImportJson} className="hidden" />
        </SectionCard>

        {/* DANGER ZONE */}
        <SectionCard icon={AlertTriangle} title="Danger zone" accent="bg-red-500">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500" />
          <SettingRow title="Erase everything" desc="Permanently delete all chats and settings on this device" isButton onClick={() => setShowResetModal(true)}>
            <ChevronRight className="w-4 h-4 text-red-500/50" />
          </SettingRow>
        </SectionCard>

      </div>

      {/* DANGER ZONE MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="glass-deep border-red-500/50 w-full max-w-md p-6 rounded-xl shadow-2xl relative space-y-4">
            <button onClick={() => setShowResetModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-red-500">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold tracking-widest uppercase">
                Erase everything?
              </h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              This permanently deletes all chats, keys, and settings saved on this device. Chats already synced to the cloud will come back when you log in again.
            </p>

            <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-lg text-[10px] text-red-400 font-mono tracking-widest">
              This can't be undone.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowResetModal(false)} className="px-4 py-2 text-zinc-300 hover:text-white text-[10px] font-bold tracking-widest uppercase rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleConfirmReset} className="px-4 py-2 bg-red-500 hover:bg-red-400 text-black text-[10px] font-bold tracking-widest uppercase rounded-lg transition-colors">
                Erase everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ACCOUNT MODAL */}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="glass-deep border-red-500/50 w-full max-w-md p-6 rounded-xl shadow-2xl relative space-y-4">
            <button onClick={() => setShowDeleteAccountModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 text-red-500">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold tracking-widest uppercase">Delete your account?</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Your follows, requests and notifications are erased. Your profile becomes
              “Deleted account” and can't be used again. Your username will stay reserved —
              full removal of the login record needs the site owner's dashboard.
            </p>
            <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-lg text-[10px] text-red-400 font-mono tracking-widest">
              This can't be undone.
            </div>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="w-full bg-[#050505] border border-zinc-800 focus:border-red-500 px-3 py-2 text-white text-xs outline-none rounded-md uppercase tracking-widest"
            />
            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={() => setShowDeleteAccountModal(false)} className="px-4 py-2 text-zinc-300 hover:text-white text-[10px] font-bold tracking-widest uppercase rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                className="px-4 py-2 bg-red-500 hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-[10px] font-bold tracking-widest uppercase rounded-lg transition-colors"
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;

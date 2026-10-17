import React, { useState } from 'react';
import {
  ArrowLeft, Check, Pencil, Settings, ShieldAlert, Flame,
  Eye, Download, LogOut, ChevronRight, MessageCircle, Send, Timer, AtSign,
} from 'lucide-react';
import { useCrypto, supabase } from '../../contexts/CryptoContext';
import Avatar from './Avatar';
import { AVATAR_CHOICES, getMyBio, setMyBio, readPreviewCache } from '../../utils/chatMeta';
import { updateAccountProfile } from '../../utils/auth';

export interface ProfilePanelProps {
  onBack: () => void;
  onOpenSettings: () => void;
  onTriggerPanic: () => void;
}

/**
 * Instagram-style profile page in the Axon theme:
 * big avatar, alias, stats, quick toggles, security & data actions.
 */
export const ProfilePanel: React.FC<ProfilePanelProps> = ({ onBack, onOpenSettings, onTriggerPanic }) => {
  const {
    alias, deviceId, updateAlias, chats, settings, updateSettings,
    backendMode, networkStatus, myGradient, updateMyGradient, account, logout,
  } = useCrypto();

  const myHandle = account?.username?.toLowerCase() || '';
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasInput, setAliasInput] = useState(alias);
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState(getMyBio());
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const previewCache = readPreviewCache();
  const totalMessages = Object.keys(previewCache).length; // chats with activity
  const messageCount = (() => {
    try {
      const all = JSON.parse(localStorage.getItem('axon_messages') || '[]') as { sender_id: string }[];
      const cloudNote = backendMode === 'online' ? ' (local backup)' : '';
      return { n: all.filter(m => m.sender_id === deviceId).length, note: cloudNote };
    } catch {
      return { n: 0, note: '' };
    }
  })();

  const saveAlias = () => {
    if (aliasInput.trim()) updateAlias(aliasInput.trim());
    setEditingAlias(false);
  };

  const saveBio = async () => {
    setMyBio(bioInput.trim());
    if (myHandle && supabase && bioInput.trim() !== '') {
      setSavingProfile(true);
      await updateAccountProfile(supabase, myHandle, { bio: bioInput.trim().slice(0, 80) });
      setSavingProfile(false);
    }
    setEditingBio(false);
  };

  const pickAvatar = async (g: string) => {
    updateMyGradient(g);
    if (myHandle && supabase) {
      setSavingProfile(true);
      await updateAccountProfile(supabase, myHandle, { avatar_gradient: g });
      setSavingProfile(false);
    }
    setPickingAvatar(false);
  };

  return (
    <section className="h-full flex flex-col min-w-0 bg-[#05060b]/40 overflow-y-auto feed-scroll">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-[60px] border-b border-white/[0.06] sticky top-0 bg-[#05060b]/90 backdrop-blur-sm z-10 shrink-0">
        <button onClick={onBack} className="p-1.5 text-zinc-400 hover:text-white transition-colors" title="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-bold text-white text-sm tracking-wide">Profile</span>
        <div className="flex-1" />
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-full text-zinc-400 hover:text-cyan-300 hover:bg-white/5 transition-colors"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      <div className="max-w-xl w-full mx-auto px-5 py-8">
        {/* Identity block */}
        <div className="flex items-center gap-6 sm:gap-8">
          <div className="relative">
            <Avatar seed={deviceId} name={alias || '?'} size={88} ring="story" gradient={myGradient} onClick={() => setPickingAvatar(v => !v)} />
            <button
              onClick={() => setPickingAvatar(v => !v)}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-cyan-400 text-black flex items-center justify-center glow-cyan hover:brightness-110 transition-all"
              title="Change avatar"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-3 gap-2 text-center max-w-[280px]">
              <Stat value={chats.length} label="chats" />
              <Stat value={messageCount.n} label={`sent${messageCount.note}`} />
              <Stat value={totalMessages} label="active" />
            </div>
          </div>
        </div>

        {/* Name / @username */}
        <div className="mt-6">
          <div className="flex items-center gap-2">
            {myHandle ? (
              <span className="font-bold text-white text-base tracking-wide flex items-center gap-1.5">
                <AtSign className="w-3.5 h-3.5 text-cyan-400" />{myHandle}
              </span>
            ) : (
              <>
                <span className="font-bold text-white text-base tracking-wide">{alias}</span>
                <button onClick={() => { setEditingAlias(true); setAliasInput(alias); }} className="text-zinc-500 hover:text-cyan-300 transition-colors" title="Edit alias">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
          {!editingAlias && (
            <p className="text-[11px] text-zinc-600 mt-1 font-mono">
              {myHandle ? `AXON ACCOUNT · ${networkStatus}` : `NODE_${deviceId.substring(0, 8).toUpperCase()} · ${networkStatus}`}
            </p>
          )}
          {editingAlias ? (
            <div className="mt-2 flex items-center gap-2 max-w-sm">
              <input
                value={aliasInput}
                onChange={e => setAliasInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveAlias(); if (e.key === 'Escape') setEditingAlias(false); }}
                className="flex-1 term-input rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                autoFocus
                maxLength={24}
              />
              <button onClick={saveAlias} className="text-emerald-400 hover:text-emerald-300 p-1.5" title="Save"><Check className="w-4 h-4" /></button>
            </div>
          ) : null}
        </div>

        {/* Bio / note */}
        <div className="mt-4">
          {editingBio ? (
            <div className="flex items-center gap-2">
              <input
                value={bioInput}
                onChange={e => setBioInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveBio(); if (e.key === 'Escape') setEditingBio(false); }}
                placeholder="Add a short note…"
                className="flex-1 term-input rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                autoFocus
                maxLength={80}
              />
              <button onClick={saveBio} className="text-emerald-400 hover:text-emerald-300 p-1.5" title="Save"><Check className="w-4 h-4" /></button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingBio(true); setBioInput(getMyBio()); }}
              className="text-left text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
              title="Click to edit your note"
            >
              {getMyBio() || <span className="text-zinc-600 italic">Tap to add a note about you…</span>}
            </button>
          )}
        </div>

        {/* Avatar picker */}
        {pickingAvatar && (
          <div className="mt-5 term-panel rounded-xl p-4 border border-white/10">
            <div className="text-[9px] font-bold tracking-[0.25em] uppercase text-zinc-500 mb-3">Pick your avatar</div>
            <div className="flex flex-wrap gap-3">
              {AVATAR_CHOICES.map(g => (
                <button
                  key={g}
                  onClick={() => pickAvatar(g)}
                  className={`w-10 h-10 rounded-full transition-transform hover:scale-110 ${myGradient === g ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0a0a12]' : ''}`}
                  style={{ background: g }}
                  aria-label="Avatar gradient"
                />
              ))}
            </div>
          </div>
        )}

        {/* Quick settings */}
        <div className="mt-8 term-panel rounded-xl border border-white/[0.07] divide-y divide-white/[0.05] overflow-hidden">
          <div className="px-4 py-2.5 text-[9px] font-bold tracking-[0.25em] uppercase text-zinc-500">Quick controls</div>
          <QuickToggle
            icon={settings.stealthMode ? <Eye className="w-4 h-4 text-cyan-300" /> : <Eye className="w-4 h-4 text-zinc-500" />}
            label="Stealth mode"
            hint="Blur everything when the tab loses focus"
            on={settings.stealthMode}
            onToggle={() => updateSettings({ stealthMode: !settings.stealthMode })}
          />
          <QuickToggle
            icon={settings.burnOnRead ? <Flame className="w-4 h-4 text-red-400" /> : <Flame className="w-4 h-4 text-zinc-500" />}
            label="Burn-on-read"
            hint="Messages auto-destruct after the timer"
            on={settings.burnOnRead}
            onToggle={() => updateSettings({ burnOnRead: !settings.burnOnRead })}
          />
          <div className="flex items-center gap-3 px-4 py-3">
            <Timer className="w-4 h-4 text-zinc-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-200">Burn timer</div>
              <div className="text-[10px] text-zinc-600">Seconds before payloads self-destruct</div>
            </div>
            <select
              value={settings.burnDelaySeconds}
              onChange={e => updateSettings({ burnDelaySeconds: Number(e.target.value) })}
              className="term-input rounded-lg px-2 py-1.5 text-xs text-white outline-none"
            >
              {[5, 10, 30, 60, 300, 3600].map(s => (
                <option key={s} value={s}>{s < 60 ? `${s}s` : s < 3600 ? `${s / 60}m` : '1h'}</option>
              ))}
            </select>
          </div>
          <QuickToggle
            icon={settings.allowFiles ? <Download className="w-4 h-4 text-emerald-300" /> : <Download className="w-4 h-4 text-zinc-500" />}
            label="Attachments"
            hint="Allow sending files and photos"
            on={settings.allowFiles}
            onToggle={() => updateSettings({ allowFiles: !settings.allowFiles })}
          />
          <QuickToggle
            icon={settings.allowVoice ? <Send className="w-4 h-4 text-emerald-300" /> : <Send className="w-4 h-4 text-zinc-500" />}
            label="Voice memos"
            hint="Record and send voice messages"
            on={settings.allowVoice}
            onToggle={() => updateSettings({ allowVoice: !settings.allowVoice })}
          />
        </div>

        {/* Security & data */}
        <div className="mt-4 term-panel rounded-xl border border-white/[0.07] divide-y divide-white/[0.05] overflow-hidden">
          <div className="px-4 py-2.5 text-[9px] font-bold tracking-[0.25em] uppercase text-zinc-500">Security & data</div>
          <ActionRow
            icon={<Settings className="w-4 h-4 text-zinc-400" />}
            label="All settings"
            hint="Appearance, alerts, sync, import / export"
            onClick={onOpenSettings}
            trailing={<ChevronRight className="w-4 h-4 text-zinc-600" />}
          />
          <ActionRow
            icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
            label="Panic screen"
            hint="Instant fake 404 overlay (or type /panic)"
            onClick={onTriggerPanic}
          />
          {myHandle && (
            <ActionRow
              icon={<LogOut className="w-4 h-4 text-zinc-400" />}
              label={`Log out @${myHandle}`}
              hint="End this account session on this device"
              onClick={() => { if (confirm('Log out of Axon Logs?')) logout(); }}
            />
          )}
          <ActionRow
            icon={<LogOut className="w-4 h-4 text-red-400" />}
            label="Terminate session"
            hint="Wipe this device's local data and reload"
            onClick={() => { if (confirm('Wipe ALL local Axon data on this device and reload?')) { localStorage.clear(); window.location.reload(); } }}
            danger
          />
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-[9px] tracking-[0.3em] uppercase text-zinc-700">
          <MessageCircle className="w-3 h-3" />
          {savingProfile ? 'syncing…' : 'axon logs · chat only · no feeds no noise'}
        </div>
      </div>
    </section>
  );
};

const Stat: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div className="flex flex-col items-center">
    <span className="text-white font-bold text-lg tabular-nums">{value}</span>
    <span className="text-[10px] text-zinc-500 tracking-wide">{label}</span>
  </div>
);

const QuickToggle: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}> = ({ icon, label, hint, on, onToggle }) => (
  <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left">
    <span className="shrink-0">{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-xs text-zinc-200">{label}</span>
      <span className="block text-[10px] text-zinc-600">{hint}</span>
    </span>
    <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${on ? 'bg-emerald-500/80' : 'bg-zinc-700'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  </button>
);

const ActionRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
}> = ({ icon, label, hint, onClick, trailing, danger }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
      danger ? 'hover:bg-red-500/[0.06]' : 'hover:bg-white/[0.03]'
    }`}
  >
    <span className="shrink-0">{icon}</span>
    <span className="flex-1 min-w-0">
      <span className={`block text-xs ${danger ? 'text-red-300' : 'text-zinc-200'}`}>{label}</span>
      {hint && <span className="block text-[10px] text-zinc-600">{hint}</span>}
    </span>
    {trailing}
  </button>
);

export default ProfilePanel;

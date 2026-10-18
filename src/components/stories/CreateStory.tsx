import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, X, Type, Users, UserCheck, Upload, Check } from 'lucide-react';
import { supabase } from '../../contexts/CryptoContext';
import { useCrypto } from '../../contexts/CryptoContext';
import { uploadStoryMedia, createStory, MAX_STORY_BYTES, ALLOWED_STORY_TYPES, type StoryOverlay } from '../../utils/stories';
import SecurityNote from '../ui/SecurityNote';

export interface CreateStoryProps {
  onBack: () => void;
  onDone: () => void;
}

const TEXT_COLORS = ['#ffffff', '#22d3ee', '#34d399', '#f472b6', '#fbbf24', '#a78bfa'];
const PLACE_SPOTS = [
  { x: 0.5, y: 0.22 },
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0.78 },
];

/**
 * Instagram-style story composer (Axon theme):
 *   pick photo/video → optional text overlays + caption → audience
 *   (Followers / Close friends) → upload. Media lands in the PRIVATE
 *   story_media bucket; the story row expires server-side in 24h.
 */
export const CreateStory: React.FC<CreateStoryProps> = ({ onBack, onDone }) => {
  const { account, backendMode } = useCrypto();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<StoryOverlay[]>([]);
  const [draftText, setDraftText] = useState('');
  const [draftColor, setDraftColor] = useState(0);
  const [draftSpot, setDraftSpot] = useState(1);
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<'followers' | 'close_friends'>('followers');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!account) return null;

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (!ALLOWED_STORY_TYPES.includes(f.type)) {
      setError("That file type isn't supported. Use a photo (JPG/PNG/WebP) or a video (MP4/WebM).");
      return;
    }
    if (f.size > MAX_STORY_BYTES) {
      setError('That file is too large — keep stories under 10MB.');
      return;
    }
    setFile(f);
  };

  const addTextOverlay = () => {
    const text = draftText.trim();
    if (!text) return;
    const spot = PLACE_SPOTS[draftSpot];
    setOverlays(prev => [
      ...prev,
      { text: text.slice(0, 120), x: spot.x, y: spot.y, size: 28, color: TEXT_COLORS[draftColor] },
    ]);
    setDraftText('');
    setDraftSpot(s => (s + 1) % PLACE_SPOTS.length);
  };

  const share = async () => {
    if (!file || !supabase || busy) return;
    setBusy(true);
    setError(null);
    const up = await uploadStoryMedia(supabase, account.username, audience, file);
    if (!up.ok) {
      setBusy(false);
      setError(up.error);
      return;
    }
    const res = await createStory(supabase, {
      username: account.username,
      media_path: up.path,
      media_type: up.type,
      caption: caption.trim(),
      overlays,
      audience,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    setTimeout(onDone, 900);
  };

  if (backendMode !== 'online') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
        <Upload className="w-10 h-10 text-zinc-600" />
        <p className="text-zinc-400 text-sm max-w-xs leading-relaxed">
          Stories need the cloud connection. You're offline right now — reconnect to share one.
        </p>
        <button onClick={onBack} className="btn-premium px-6 py-2.5 rounded-lg text-xs">Back</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#07070d]/80">
      {/* header */}
      <header className="shrink-0 flex items-center gap-3 px-3 sm:px-4 h-[56px] border-b border-white/[0.06]">
        <button onClick={onBack} className="p-1.5 text-zinc-400 hover:text-white transition-colors" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-white font-bold text-sm tracking-wide flex-1">Add to your story</span>
        {file && !done && (
          <button
            onClick={share}
            disabled={busy}
            className="btn-premium px-5 py-2 rounded-lg text-xs disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy ? 'Sharing…' : done ? <><Check className="w-3.5 h-3.5" /> Shared</> : 'Share'}
          </button>
        )}
      </header>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto feed-scroll">
        {/* preview */}
        <div className="flex-1 min-h-[300px] relative bg-[#0b0d14] flex items-center justify-center">
          {!previewUrl && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-3 text-zinc-500 hover:text-cyan-300 transition-colors"
            >
              <Upload className="w-12 h-12" />
              <span className="text-sm font-semibold">Tap to choose a photo or video</span>
              <span className="text-xs text-zinc-600">JPG · PNG · WebP · MP4 · WebM — up to 10MB</span>
            </button>
          )}
          {previewUrl && (
            <div className="relative w-full h-full max-w-[430px] max-h-full">
              {file?.type.startsWith('video/') ? (
                <video src={previewUrl} controls className="w-full h-full object-contain" />
              ) : (
                <img src={previewUrl} alt="" className="w-full h-full object-contain" />
              )}
              {overlays.map((o, i) => (
                <div
                  key={i}
                  className="absolute font-bold whitespace-pre-wrap break-words drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                  style={{
                    left: `${o.x * 100}%`,
                    top: `${o.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    fontSize: `${Math.max(16, o.size * 0.5)}px`,
                    color: o.color,
                    maxWidth: '80%',
                    textAlign: 'center',
                  }}
                >
                  {o.text}
                  <button
                    type="button"
                    onClick={() => setOverlays(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-black/70 border border-white/30 text-white flex items-center justify-center"
                    aria-label="Remove text"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFile(null)}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 border border-white/20 text-white hover:bg-black/80"
                aria-label="Choose different media"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_STORY_TYPES.join(',')}
            className="hidden"
            onChange={e => pickFile(e.target.files?.[0] || null)}
          />
        </div>

        {/* composer sidebar */}
        <aside className="w-full md:w-[300px] shrink-0 border-t md:border-t-0 md:border-l border-white/[0.06] p-4 space-y-4">
          {/* text tool */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-1.5">Text on the story</label>
            <div className="flex gap-1.5 mb-2">
              {TEXT_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraftColor(i)}
                  aria-label={`Text color ${i + 1}`}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${draftColor === i ? 'border-cyan-300 scale-110' : 'border-white/20'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={draftText}
                onChange={e => setDraftText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTextOverlay(); } }}
                placeholder="Type something…"
                maxLength={120}
                className="flex-1 term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500/60"
              />
              <button
                type="button"
                onClick={addTextOverlay}
                disabled={!draftText.trim()}
                className="term-panel term-interactive px-3 rounded-lg border border-white/10 text-cyan-300 disabled:text-zinc-600"
                aria-label="Add text"
              >
                <Type className="w-4 h-4" />
              </button>
            </div>
            {overlays.length > 0 && (
              <p className="text-[10px] text-zinc-600 mt-1.5">
                Tap × on a text bubble to remove it. {overlays.length}/6 added.
              </p>
            )}
          </div>

          {/* caption */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-1.5">Caption (optional)</label>
            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="A short line under your story"
              maxLength={120}
              className="w-full term-input rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500/60"
            />
          </div>

          {/* audience */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-1.5">Who can see it</label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setAudience('followers')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  audience === 'followers' ? 'border-cyan-400/60 bg-cyan-400/10' : 'border-white/[0.08] hover:bg-white/[0.04]'
                }`}
              >
                <Users className="w-4 h-4 text-cyan-300 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-white font-semibold">Followers</span>
                  <span className="block text-[10px] text-zinc-500 leading-tight">
                    People who follow you {`(everyone, if your account is public)`}
                  </span>
                </span>
                {audience === 'followers' && <Check className="w-4 h-4 text-cyan-300" />}
              </button>
              <button
                type="button"
                onClick={() => setAudience('close_friends')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  audience === 'close_friends' ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-white/[0.08] hover:bg-white/[0.04]'
                }`}
              >
                <UserCheck className="w-4 h-4 text-emerald-300 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-white font-semibold">Close friends</span>
                  <span className="block text-[10px] text-zinc-500 leading-tight">Only people on your Close Friends list</span>
                </span>
                {audience === 'close_friends' && <Check className="w-4 h-4 text-emerald-300" />}
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">
              The server hides this story from everyone else — and deletes it for good after 24 hours.
            </p>
          </div>

          {error && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">{error}</div>
          )}

          <SecurityNote compact className="w-full" />
        </aside>
      </div>
    </div>
  );
};

export default CreateStory;

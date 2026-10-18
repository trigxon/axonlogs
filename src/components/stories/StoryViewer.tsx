import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Heart, Eye, Send, MoreHorizontal, Trash2, Pause, Play } from 'lucide-react';
import { supabase } from '../../contexts/CryptoContext';
import {
  storyMediaUrl, markStoryViewed, reactToStory, fetchStoryViewers,
  deleteStory, notifyStoryReply,
  type Story, type StoryTrayEntry, type StoryViewRow,
} from '../../utils/stories';
import { StoryAvatar } from './StoriesRail';
import { storyAgeLabel } from '../../utils/stories';

export interface StoryViewerProps {
  entries: StoryTrayEntry[];
  startIndex: number;
  myUsername: string;
  onClose: () => void;
  onOpenProfile: (username: string) => void;
  /** sends a DM reply to the story owner (follow-gated by the engine) */
  onReply?: (username: string, text: string) => Promise<boolean>;
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '🔥', '👍', '🙏'];
const SEGMENT_MS = 6000;

/**
 * Full-screen Instagram story viewer:
 *  • progress segments per story, auto-advance, tap zones (prev/next),
 *  • pause on hold, heart quick-reactions, reply (DM, follow-gated),
 *  • owner mode: viewer list + delete,
 *  • expiry + audience come from the server (RLS) — nothing to spoof here.
 */
export const StoryViewer: React.FC<StoryViewerProps> = ({ entries, startIndex, myUsername, onClose, onOpenProfile, onReply }) => {
  const [entryIdx, setEntryIdx] = useState(Math.min(startIndex, Math.max(0, entries.length - 1)));
  const [storyIdx, setStoryIdx] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [viewers, setViewers] = useState<StoryViewRow[] | null>(null);
  const [showViewers, setShowViewers] = useState(false);
  const [reacted, setReacted] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySent, setReplySent] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const entry = entries[entryIdx];
  const story: Story | undefined = entry?.stories[storyIdx];
  const isMine = !!story && story.username === myUsername.trim().toLowerCase();

  /* reset per-story state */
  useEffect(() => {
    setMediaUrl(null);
    setMediaError(false);
    setProgress(0);
    setViewers(null);
    setShowViewers(false);
    setReacted(null);
    setReplyText('');
    setReplySent(false);
    setMenuOpen(false);
    if (!story) return;
    let alive = true;
    storyMediaUrl(supabase, story.media_path)
      .then(u => { if (alive) setMediaUrl(u); })
      .catch(() => { if (alive) setMediaError(true); });
    if (!isMine && myUsername) {
      markStoryViewed(supabase, story.id, myUsername).catch(() => undefined);
    } else if (isMine) {
      fetchStoryViewers(supabase, story.id)
        .then(v => { if (alive) setViewers(v); })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [story?.id, isMine, myUsername]);

  /* progress ticker (video uses timeupdate-ish rAF too — keeps one code path) */
  const advance = useCallback(() => {
    setProgress(0);
    if (!entry) return;
    if (storyIdx < entry.stories.length - 1) {
      setStoryIdx(i => i + 1);
    } else if (entryIdx < entries.length - 1) {
      setEntryIdx(i => i + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
  }, [entry, storyIdx, entryIdx, entries.length, onClose]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx(i => i - 1);
      setProgress(0);
    } else if (entryIdx > 0) {
      const prev = entries[entryIdx - 1];
      setEntryIdx(entryIdx - 1);
      setStoryIdx(Math.max(0, prev.stories.length - 1));
      setProgress(0);
    }
  }, [storyIdx, entryIdx, entries]);

  useEffect(() => {
    if (!story || paused || showViewers || mediaError) return;
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      setProgress(p => {
        const next = p + dt / SEGMENT_MS;
        if (next >= 1) {
          // advance outside the setter
          setTimeout(advance, 0);
          return 0;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [story?.id, paused, showViewers, mediaError, advance]);

  /* keyboard nav */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight' || e.key === ' ') advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, advance]);

  if (!entry || !story) return null;

  const handleReaction = async (emoji: string) => {
    if (isMine || !myUsername) return;
    setReacted(emoji);
    await reactToStory(supabase, story.id, myUsername, emoji).catch(() => undefined);
  };

  const handleReply = async () => {
    const text = replyText.trim();
    if (!text || isMine || !myUsername || !onReply) return;
    const ok = await onReply(story.username, `[Story reply] ${text}`);
    if (ok) {
      setReplyText('');
      setReplySent(true);
      notifyStoryReply(supabase, story.id, story.username, myUsername).catch(() => undefined);
      setTimeout(() => setReplySent(false), 2600);
    }
  };

  const handleDelete = async () => {
    const ok = await deleteStory(supabase, story.id);
    if (!ok) return;
    const nextStories = entry.stories.filter(s => s.id !== story.id);
    const nextEntries = [...entries];
    if (nextStories.length === 0) {
      nextEntries.splice(entryIdx, 1);
      if (nextEntries.length === 0) {
        onClose();
        return;
      }
      setEntryIdx(Math.min(entryIdx, nextEntries.length - 1));
      setStoryIdx(0);
    } else {
      nextEntries[entryIdx] = { ...entry, stories: nextStories };
      setStoryIdx(i => Math.min(i, nextStories.length - 1));
    }
    // keep local copy in sync for the remaining renders
    (entries as StoryTrayEntry[]).splice(0, entries.length, ...nextEntries);
    setEntryIdx(v => v); // force re-render
  };

  const audienceLabel =
    story.audience === 'close_friends' ? 'Close friends' : 'Followers';

  return (
    <div className="fixed inset-0 z-[150] bg-black/95 flex items-center justify-center" role="dialog" aria-label="Story viewer">
      {/* top progress segments */}
      <div className="absolute top-0 left-0 right-0 z-20 px-3 pt-3">
        <div className="flex gap-1 mb-3">
          {entry.stories.map((s, i) => (
            <div key={s.id} className="h-[2.5px] flex-1 rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full bg-white transition-none"
                style={{ width: i < storyIdx ? '100%' : i === storyIdx ? `${Math.min(100, progress * 100)}%` : '0%' }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => { onClose(); onOpenProfile(story.username); }} className="flex items-center gap-2 min-w-0">
            <StoryAvatar username={story.username} size={34} ring="none" />
            <span className="text-white text-sm font-semibold truncate max-w-[40vw]">@{story.username}</span>
          </button>
          <span className="text-zinc-400 text-xs shrink-0">{storyAgeLabel(story.created_at)}</span>
          <span className="text-[8px] font-bold tracking-[0.2em] uppercase text-cyan-300/80 border border-cyan-400/30 bg-cyan-400/10 rounded px-1.5 py-0.5 shrink-0">
            {audienceLabel}
          </span>
          <div className="flex-1" />
          {paused && <Pause className="w-3.5 h-3.5 text-zinc-400" aria-label="Paused" />}
          {!isMine && (
            <button type="button" onClick={() => setPaused(p => !p)} className="text-zinc-300 hover:text-white p-1" aria-label={paused ? 'Resume' : 'Pause'}>
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
          {isMine && (
            <button type="button" onClick={() => setMenuOpen(m => !m)} className="text-zinc-300 hover:text-white p-1" aria-label="Story options">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          )}
          <button type="button" onClick={onClose} className="text-zinc-300 hover:text-white p-1" aria-label="Close stories">
            <X className="w-5 h-5" />
          </button>
        </div>
        {menuOpen && isMine && (
          <div className="absolute right-3 mt-1 term-panel rounded-xl border border-white/10 py-1 w-44 shadow-2xl">
            <button
              type="button"
              onClick={() => { setShowViewers(v => !v); setMenuOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-xs text-zinc-200 hover:bg-white/5 flex items-center gap-2"
            >
              <Eye className="w-3.5 h-3.5" /> Viewers ({viewers?.length ?? '…'})
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="w-full text-left px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete story
            </button>
          </div>
        )}
      </div>

      {/* media */}
      <div
        className="relative w-full h-full max-w-[430px] sm:max-w-[480px] sm:h-[92vh] sm:rounded-2xl overflow-hidden bg-[#0b0d14]"
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        {mediaUrl && story.media_type === 'image' && (
          <img src={mediaUrl} alt="" className="w-full h-full object-contain" draggable={false} />
        )}
        {mediaUrl && story.media_type === 'video' && (
          <video src={mediaUrl} autoPlay playsInline muted={false} controls={false} className="w-full h-full object-contain" onEnded={advance} />
        )}
        {!mediaUrl && !mediaError && (
          <div className="w-full h-full flex items-center justify-center text-[10px] tracking-widest uppercase text-zinc-600 animate-pulse">
            Loading story…
          </div>
        )}
        {mediaError && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500 text-sm px-8 text-center">
            <span>This story couldn't load.</span>
            <span className="text-xs text-zinc-600">It may have expired or you may not have access to it.</span>
          </div>
        )}

        {/* text overlays (rendered client-side; server stores the JSON) */}
        {(story.overlays || []).map((o, i) => (
          <div
            key={i}
            className="absolute font-bold whitespace-pre-wrap break-words drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] pointer-events-none"
            style={{
              left: `${o.x * 100}%`,
              top: `${o.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${Math.max(14, o.size * 0.42)}px`,
              color: o.color,
              maxWidth: '80%',
              textAlign: 'center',
            }}
          >
            {o.text}
          </div>
        ))}

        {story.caption && (
          <div className="absolute bottom-24 left-0 right-0 text-center px-6 text-white text-sm font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] pointer-events-none">
            {story.caption}
          </div>
        )}

        {/* tap zones */}
        <button type="button" className="absolute left-0 top-16 bottom-24 w-1/3 opacity-0" aria-label="Previous story" onClick={goPrev} />
        <button type="button" className="absolute right-0 top-16 bottom-24 w-1/3 opacity-0" aria-label="Next story" onClick={advance} />
      </div>

      {/* viewer list (owner only) */}
      {showViewers && isMine && (
        <div className="absolute bottom-0 left-0 right-0 z-30 max-h-[45vh] overflow-y-auto feed-scroll term-panel border-t border-white/10 rounded-t-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white text-sm font-bold">Viewers</span>
            <button type="button" onClick={() => setShowViewers(false)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {(viewers || []).length === 0 && (
            <p className="text-zinc-500 text-xs py-4 text-center">No views yet.</p>
          )}
          {(viewers || []).map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => { setShowViewers(false); onOpenProfile(v.viewer); }}
              className="w-full flex items-center gap-2.5 py-2 hover:bg-white/5 rounded-lg px-2 text-left"
            >
              <StoryAvatar username={v.viewer} size={34} ring="none" />
              <span className="text-sm text-white flex-1 truncate">@{v.viewer}</span>
              {v.reaction && <span className="text-lg">{v.reaction}</span>}
              <span className="text-[10px] text-zinc-500">{storyAgeLabel(v.viewed_at)}</span>
            </button>
          ))}
        </div>
      )}

      {/* reply / reactions footer (viewer only) */}
      {!isMine && (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-5 pt-3 bg-gradient-to-t from-black/90 to-transparent">
          {replySent ? (
            <div className="text-center text-emerald-400 text-xs font-bold tracking-wide py-2">Reply sent ✓</div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleReply(); }}
                placeholder={`Reply to @${story.username}…`}
                maxLength={300}
                className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2.5 text-sm text-white placeholder-zinc-400 outline-none focus:border-cyan-400/60"
              />
              <button type="button" onClick={handleReply} disabled={!replyText.trim()} aria-label="Send reply" className="text-cyan-300 disabled:text-zinc-600 p-2">
                <Send className="w-5 h-5" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-center gap-4 mt-3">
            {QUICK_REACTIONS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleReaction(emoji)}
                className="text-2xl hover:scale-125 transition-transform"
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            {reacted && <span className="text-[10px] text-zinc-400 ml-1">Sent {reacted}</span>}
          </div>
          <p className="text-center text-[9px] text-zinc-600 mt-2">
            Replies land in your chat with them (you need to follow each other's rules — follows unlock chats).
          </p>
        </div>
      )}

      {/* owner hint */}
      {isMine && !showViewers && (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-5 pt-3 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-2 text-zinc-400 text-xs">
          <Heart className="w-3.5 h-3.5" /> {viewers?.length ?? 0} view{(viewers?.length ?? 0) === 1 ? '' : 's'} · tap ⋯ for options
        </div>
      )}
    </div>
  );
};

export default StoryViewer;

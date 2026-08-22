import { useEffect, useRef, useState } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Phone, Maximize2, Minimize2, FlipHorizontal, Volume2, VolumeX } from 'lucide-react';

/** Terminal-styled WebRTC call overlay — REAL peer-to-peer media.
 *  - Remote stream plays in the main stage (video) or a hidden <audio> (audio)
 *  - Local preview mirrors into PiP
 *  - Status phases: ringing → connecting → connected | failed
 *  - Connection quality derived from live RTCP round-trip-time stats */

export default function CallOverlay() {
  const {
    callingChat, callType, callStatus, callNotice,
    localStream, remoteStream,
    endCall, alias, getCallRtt,
  } = useCrypto();

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [flipped, setFlipped] = useState(true); // local preview mirrored by default
  const [expanded, setExpanded] = useState(false);
  const [rtt, setRtt] = useState<number | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const ct = callType ?? 'audio';

  /* ── Stream attachment ── */
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, expanded]);

  /* ── Surface getUserMedia failures surfaced by the engine ── */
  useEffect(() => {
    if ((callStatus === 'connecting' || callStatus === 'failed') && !localStream && !callingChat?.id) return;
    if (callStatus === 'connecting' && !localStream) {
      const t = window.setTimeout(() => {
        if (!localStream) setMediaError('WAITING FOR MIC/CAMERA PERMISSION…');
      }, 2500);
      return () => clearTimeout(t);
    }
    if (localStream) setMediaError(null);
  }, [callStatus, localStream, callingChat]);

  /* ── Duration counts from connect time ── */
  useEffect(() => {
    if (!callingChat || callStatus !== 'connected') { setDuration(0); return; }
    const iv = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(iv);
  }, [callingChat, callStatus]);

  /* ── Live quality sampling while connected ── */
  useEffect(() => {
    if (callStatus !== 'connected') { setRtt(null); return; }
    let alive = true;
    const sample = async () => {
      const v = await getCallRtt();
      if (alive) setRtt(v);
    };
    void sample();
    const iv = setInterval(sample, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, [callStatus, getCallRtt]);

  /* ── Auto-dismiss failure screens ── */
  useEffect(() => {
    if (callStatus !== 'failed' || !callingChat) return;
    const t = setTimeout(() => endCall(), 3200);
    return () => clearTimeout(t);
  }, [callStatus, callingChat, endCall]);

  if (!callingChat) return null;

  /* ── Controls (operate on real tracks) ── */
  const toggleMute = () => {
    localStream?.getAudioTracks().forEach(t => { t.enabled = muted; });
    setMuted(!muted);
  };

  const toggleVideo = () => {
    localStream?.getVideoTracks().forEach(t => { t.enabled = videoOff; });
    setVideoOff(!videoOff);
  };

  const toggleDeafen = () => {
    const next = !remoteMuted;
    if (remoteVideoRef.current) remoteVideoRef.current.muted = next;
    if (remoteAudioRef.current) remoteAudioRef.current.muted = next;
    setRemoteMuted(next);
  };

  const fmt = (s: number) => {
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${mins.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  /* ── Quality derivation from measured RTT ── */
  const quality: 'excellent' | 'good' | 'poor' | 'linking' =
    callStatus !== 'connected' ? 'linking'
      : rtt == null ? 'linking'
        : rtt < 150 ? 'excellent'
          : rtt < 400 ? 'good' : 'poor';
  const qualityColor =
    quality === 'excellent' ? 'text-emerald-400'
      : quality === 'good' ? 'text-amber-400'
        : quality === 'poor' ? 'text-red-400' : 'text-zinc-400';
  const qualityBars = quality === 'excellent' ? 4 : quality === 'good' ? 3 : quality === 'poor' ? 1 : 0;
  const qualityLabel = quality === 'linking' ? 'LINKING' : quality.toUpperCase();

  const phaseLabel =
    callStatus === 'ringing' ? 'RINGING…'
      : callStatus === 'connecting' ? 'ESTABLISHING ENCRYPTED TUNNEL…'
        : callStatus === 'failed' ? (callNotice || 'CALL FAILED')
          : fmt(duration);

  const showFailed = callStatus === 'failed';

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center term-bg"
      style={{ background: 'linear-gradient(180deg, #050a10 0%, #0a1018 100%)' }}>

      {/* Remote audio carrier for audio-only calls */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Status bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 sm:px-7 py-2 sm:py-3 term-statusbar z-10"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)' }}>
        <span className={`text-[10px] sm:text-xs font-mono tracking-wider flex items-center gap-1.5 ${showFailed ? 'text-red-400' : 'text-emerald-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${showFailed ? 'bg-red-400' : 'bg-emerald-400'} dot-live`} />
          {ct === 'video' ? 'VIDEO' : 'AUDIO'} LINK {callStatus === 'connected' ? '// LIVE' : showFailed ? '// FAILED' : '// PENDING'}
        </span>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className={`${qualityColor} text-[9px] sm:text-[10px] font-mono flex items-center gap-1`}>
            <span className="flex items-end gap-[2px] h-3">
              {[1, 2, 3, 4].map(i => (
                <span key={i} className="w-[3px] rounded-sm transition-all" style={{
                  height: `${i * 25}%`,
                  background: i <= qualityBars ? 'currentColor' : 'rgba(255,255,255,0.15)',
                }} />
              ))}
            </span>
            {qualityLabel}
            {rtt != null && <span className="text-zinc-500 ml-0.5">{Math.round(rtt)}ms</span>}
          </span>
          <span className="text-cyan-300 text-[10px] sm:text-xs font-mono hidden sm:inline">{alias}</span>
          <span className={`${showFailed ? 'text-red-400' : 'text-amber-400'} text-[10px] sm:text-xs font-mono tabular-nums`}>{phaseLabel}</span>
        </div>
      </div>

      {/* Stage */}
      <div className="flex-1 flex items-center justify-center w-full px-3 sm:px-4 pt-14 pb-24 sm:pb-28 min-h-0">
        {ct === 'video' ? (
          <div className={`relative w-full overflow-hidden term-panel ${expanded ? 'h-full max-h-full' : 'max-w-2xl aspect-video'}`}>
            {/* Remote feed */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover bg-black"
            />
            {callStatus !== 'connected' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 pointer-events-none">
                <span className="w-14 h-14 sm:w-20 sm:h-20 rounded-full border border-cyan-500/40 flex items-center justify-center animate-pulse text-2xl sm:text-3xl">📡</span>
                <span className="text-cyan-300 font-mono text-[10px] sm:text-xs tracking-widest">{phaseLabel}</span>
                {(mediaError || callNotice) && !showFailed && (
                  <span className="text-zinc-400 font-mono text-[9px] sm:text-[10px]">{mediaError || callNotice}</span>
                )}
              </div>
            )}
            {/* PiP self-view */}
            <div className={`absolute bottom-3 right-3 overflow-hidden term-panel border border-cyan-500/30 ${expanded ? 'w-32 h-24 sm:w-44 sm:h-32' : 'w-20 h-16 sm:w-28 sm:h-20'}`}>
              {!videoOff && localStream ? (
                <video ref={localVideoRef} autoPlay playsInline muted
                  className="w-full h-full object-cover"
                  style={{ transform: flipped ? 'scaleX(-1)' : 'none' }}
                />
              ) : (
                <div className="w-full h-full bg-gray-900 flex items-center justify-center text-cyan-400 text-[9px] font-mono">
                  CAMERA OFF
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:gap-6">
            <div className="relative">
              <div className={`w-20 h-20 sm:w-28 sm:h-28 rounded-full term-panel flex items-center justify-center border transition-colors ${
                showFailed ? 'border-red-500/50' : 'border-cyan-500/40 animate-pulse'
              }`}>
                <span className="text-3xl sm:text-5xl">{showFailed ? '📵' : callStatus === 'connected' ? '🟢' : '📞'}</span>
              </div>
              {!showFailed && (
                <div className="absolute inset-0 rounded-full border-2 border-emerald-400/30 animate-ping" style={{ animationDuration: '2s' }} />
              )}
            </div>
            <div className="text-center px-4">
              <div className="text-cyan-300 font-mono text-base sm:text-xl tracking-wider truncate max-w-[80vw]">{callingChat.name}</div>
              <div className={`font-mono mt-1 text-[11px] sm:text-sm ${showFailed ? 'text-red-400' : 'text-gray-400'} tabular-nums`}>
                {phaseLabel}
              </div>
              {(mediaError || (callNotice && !showFailed)) && (
                <div className="text-amber-400 font-mono text-[9px] sm:text-[10px] mt-1">{mediaError || callNotice}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 sm:gap-5 px-4 term-footer z-10"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>

        {!showFailed && (
          <>
            {/* Mute mic */}
            <button
              onClick={toggleMute}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full term-panel flex items-center justify-center transition-all ${
                muted ? 'border border-red-500/60 text-red-400' : 'border border-gray-600 text-gray-300 hover:border-cyan-500/60'
              }`}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            {/* Deafen remote */}
            <button
              onClick={toggleDeafen}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full term-panel flex items-center justify-center transition-all ${
                remoteMuted ? 'border border-red-500/60 text-red-400' : 'border border-gray-600 text-gray-300 hover:border-cyan-500/60'
              }`}
              title={remoteMuted ? 'Unmute peer audio' : 'Mute peer audio'}
            >
              {remoteMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            {ct === 'video' && (
              <>
                <button
                  onClick={toggleVideo}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full term-panel flex items-center justify-center transition-all ${
                    videoOff ? 'border border-red-500/60 text-red-400' : 'border border-gray-600 text-gray-300 hover:border-cyan-500/60'
                  }`}
                  title={videoOff ? 'Turn camera on' : 'Turn camera off'}
                >
                  {videoOff ? <VideoOff size={18} /> : <VideoIcon size={18} />}
                </button>
                <button
                  onClick={() => setFlipped(!flipped)}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full term-panel flex items-center justify-center border border-gray-600 text-gray-300 hover:border-cyan-500/60 transition-all"
                  title="Mirror preview"
                >
                  <FlipHorizontal size={18} />
                </button>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full term-panel flex items-center justify-center border border-gray-600 text-gray-300 hover:border-cyan-500/60 transition-all hidden sm:flex"
                  title={expanded ? 'Minimize' : 'Expand'}
                >
                  {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
              </>
            )}

            {/* Hang up */}
            <button
              onClick={endCall}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all border-2 hover:brightness-125"
              style={{ background: 'rgba(220, 38, 38, 0.3)', borderColor: 'rgba(220, 38, 38, 0.6)' }}
              title="End call"
            >
              <PhoneOff size={22} className="text-red-400" />
            </button>
          </>
        )}

        {showFailed && (
          <button
            onClick={endCall}
            className="border border-zinc-600 text-zinc-300 hover:text-white hover:border-zinc-400 px-6 py-2.5 font-mono text-xs tracking-widest uppercase transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Failure banner overlay */}
      {showFailed && (
        <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 z-20 pointer-events-none sm:hidden">
          <div className="bg-black/70 border border-red-500/40 px-4 py-2 font-mono text-[10px] text-red-400 tracking-widest">
            ⚠ {callNotice || 'CALL FAILED'}
          </div>
        </div>
      )}
    </div>
  );
}

/** Incoming call ring screen — rendered above everything else. */
export function IncomingCallScreen() {
  const { incomingCall, acceptIncomingCall, rejectIncomingCall } = useCrypto();

  // Keep component mounted logic simple; ring animation via CSS
  useEffect(() => {
    if (!incomingCall) return;
    const prevTitle = document.title;
    document.title = `◉ INCOMING CALL — ${incomingCall.fromAlias}`;
    return () => { document.title = prevTitle; };
  }, [incomingCall]);

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[190] flex justify-center px-3 pt-[max(env(safe-area-inset-top,0px),12px)]">
      <div className="w-full max-w-md term-panel border border-emerald-500/40 shadow-2xl shadow-emerald-500/10 px-4 py-3 flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-500/50 flex items-center justify-center animate-pulse">
            {incomingCall.type === 'video' ? '🎥' : '📞'}
          </div>
          <span className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-ping" style={{ animationDuration: '1.2s' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-emerald-400 font-mono text-[9px] tracking-[0.25em] uppercase">Incoming {incomingCall.type} link</div>
          <div className="text-white font-mono text-sm tracking-wide truncate">{incomingCall.fromAlias}</div>
          <div className="text-zinc-500 font-mono text-[9px] tracking-wider truncate">// {incomingCall.chatName}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={rejectIncomingCall}
            className="w-10 h-10 rounded-full border border-red-500/50 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors"
            title="Decline"
          >
            <PhoneOff size={16} />
          </button>
          <button
            onClick={() => { void acceptIncomingCall(); }}
            className="w-10 h-10 rounded-full border border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/25 flex items-center justify-center transition-colors animate-pulse"
            title="Accept"
          >
            <Phone size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

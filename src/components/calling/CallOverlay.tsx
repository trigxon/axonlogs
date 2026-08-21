import { useEffect, useRef, useState, useCallback } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, Minimize2, FlipHorizontal } from 'lucide-react';

/** Terminal-styled WebRTC call overlay with full controls.
 *  Uses getUserMedia for local stream; signaling integration ready.
 *  Responsive: adapts from phone to TV with fluid sizing. */

export default function CallOverlay() {
  const { callingChat, callType, endCall, alias } = useCrypto();
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [speakerphone, setSpeakerphone] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor'>('excellent');
  const streamRef = useRef<MediaStream | null>(null);

  const startMedia = useCallback(async (video: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      if (pipVideoRef.current) pipVideoRef.current.srcObject = stream;
      setStreamError(null);

      // Simulate connection quality check
      const qualityCheck = () => {
        const rand = Math.random();
        setConnectionQuality(rand > 0.92 ? 'poor' : rand > 0.7 ? 'good' : 'excellent');
      };
      const qi = setInterval(qualityCheck, 5000);
      return () => clearInterval(qi);
    } catch (err: any) {
      setStreamError(
        err?.name === 'NotAllowedError' ? 'Camera/microphone permission denied'
        : err?.name === 'NotFoundError' ? 'No camera/microphone found'
        : 'Media access failed'
      );
    }
  }, []);

  useEffect(() => {
    if (!callingChat) return;
    setDuration(0);
    setMuted(false);
    setVideoOff(false);
    setSpeakerphone(false);
    setFlipped(false);
    setExpanded(false);
    startMedia(callType === 'video');
    const iv = setInterval(() => setDuration(d => d + 1), 1000);
    return () => {
      clearInterval(iv);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [callingChat, callType, startMedia]);

  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = muted; });
    setMuted(!muted);
  };

  const toggleVideo = () => {
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = videoOff; });
    setVideoOff(!videoOff);
  };

  const toggleSpeakerphone = () => {
    // In a real WebRTC setup, this would switch audio output
    setSpeakerphone(!speakerphone);
  };

  const hangUp = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    endCall();
  };

  if (!callingChat) return null;
  const ct = callType as 'audio' | 'video';

  const fmt = (s: number) => {
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${mins.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const qualityColor = connectionQuality === 'excellent' ? 'text-emerald-400' : connectionQuality === 'good' ? 'text-amber-400' : 'text-red-400';
  const qualityBars = connectionQuality === 'excellent' ? 4 : connectionQuality === 'good' ? 2 : 1;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center term-bg"
      style={{ background: 'linear-gradient(180deg, #050a10 0%, #0a1018 100%)' }}>

      {/* Status bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 term-statusbar z-10"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)' }}>
        <span className="text-emerald-400 text-[10px] sm:text-xs font-mono tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dot-live text-emerald-400" />
          {ct === 'video' ? 'VIDEO' : 'AUDIO'} CALL
        </span>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Connection quality */}
          <span className={`${qualityColor} text-[9px] sm:text-[10px] font-mono flex items-center gap-1`}>
            <span className="flex items-end gap-[2px] h-3">
              {[1, 2, 3, 4].map(i => (
                <span key={i} className="w-[3px] rounded-sm transition-all" style={{
                  height: `${i * 25}%`,
                  background: i <= qualityBars ? 'currentColor' : 'rgba(255,255,255,0.15)'
                }} />
              ))}
            </span>
            {connectionQuality.toUpperCase()}
          </span>
          <span className="text-cyan-300 text-[10px] sm:text-xs font-mono hidden sm:inline">{alias}</span>
          <span className="text-amber-400 text-[10px] sm:text-xs font-mono tabular-nums">{fmt(duration)}</span>
        </div>
      </div>

      {/* Video / Avatar area */}
      <div className="flex-1 flex items-center justify-center w-full px-3 sm:px-4 pt-14 pb-24 sm:pb-28">
        {ct === 'video' ? (
          <div className={`relative w-full overflow-hidden term-panel ${expanded ? 'h-full' : 'max-w-2xl aspect-video'}`}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transition-transform duration-300"
              style={{ transform: flipped ? 'scaleX(-1)' : 'none' }}
            />
            {/* Connection quality overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded text-[9px] font-mono">
              <span className={`${qualityColor} flex items-end gap-[2px] h-2.5`}>
                {[1, 2, 3, 4].map(i => (
                  <span key={i} className="w-[2px] rounded-sm" style={{
                    height: `${i * 25}%`,
                    background: i <= qualityBars ? 'currentColor' : 'rgba(255,255,255,0.2)'
                  }} />
                ))}
              </span>
              <span className="text-zinc-400">{fmt(duration)}</span>
            </div>
            {/* PiP self-view */}
            <div className={`absolute bottom-3 right-3 overflow-hidden term-panel border border-cyan-500/30 ${expanded ? 'w-32 h-24 sm:w-40 sm:h-28' : 'w-20 h-16 sm:w-28 sm:h-20'}`}>
              {videoOff ? (
                <div className="w-full h-full bg-gray-900 flex items-center justify-center text-cyan-400 text-[9px] font-mono">
                  CAMERA OFF
                </div>
              ) : (
                <video ref={pipVideoRef} autoPlay playsInline muted
                  className="w-full h-full object-cover"
                  style={{ transform: flipped ? 'none' : 'scaleX(-1)' }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:gap-6">
            <div className="relative">
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full term-panel flex items-center justify-center border border-cyan-500/40 animate-pulse">
                <span className="text-3xl sm:text-5xl">📞</span>
              </div>
              {/* Audio level ring */}
              <div className="absolute inset-0 rounded-full border-2 border-emerald-400/30 animate-ping" style={{ animationDuration: '2s' }} />
            </div>
            <div className="text-center">
              <div className="text-cyan-300 font-mono text-base sm:text-xl tracking-wider">{callingChat.name}</div>
              <div className="text-gray-400 text-[10px] sm:text-xs font-mono mt-1">
                {streamError || 'Call connecting...'}
              </div>
            </div>
          </div>
        )}
        {streamError && (
          <div className="absolute bottom-28 sm:bottom-32 text-amber-400 text-[10px] sm:text-xs font-mono px-4 text-center max-w-sm">
            ⚠ {streamError}
          </div>
        )}
      </div>

      {/* Controls — fluid sizing */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 sm:gap-6 px-4 term-footer z-10"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>

        {/* Mute */}
        <button
          onClick={toggleMute}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full term-panel flex items-center justify-center transition-all ${
            muted ? 'border border-red-500/60 text-red-400' : 'border border-gray-600 text-gray-300 hover:border-cyan-500/60'
          }`}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        {/* Speakerphone */}
        {callType === 'audio' && (
          <button
            onClick={toggleSpeakerphone}
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full term-panel flex items-center justify-center text-lg transition-all ${
              speakerphone ? 'border border-cyan-500/60 text-cyan-400' : 'border border-gray-600 text-gray-300 hover:border-cyan-500/60'
            }`}
            title={speakerphone ? 'Earpiece' : 'Speaker'}
          >
            🔊
          </button>
        )}

        {/* Video toggle */}
        {callType === 'video' && (
          <>
            <button
              onClick={toggleVideo}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full term-panel flex items-center justify-center transition-all ${
                videoOff ? 'border border-red-500/60 text-red-400' : 'border border-gray-600 text-gray-300 hover:border-cyan-500/60'
              }`}
              title={videoOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {videoOff ? <VideoOff size={18} /> : <Video size={18} />}
            </button>
            {/* Flip camera */}
            <button
              onClick={() => setFlipped(!flipped)}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full term-panel flex items-center justify-center border border-gray-600 text-gray-300 hover:border-cyan-500/60 transition-all"
              title="Flip camera"
            >
              <FlipHorizontal size={18} />
            </button>
            {/* Expand */}
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
          onClick={hangUp}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all border-2"
          style={{ background: 'rgba(220, 38, 38, 0.3)', borderColor: 'rgba(220, 38, 38, 0.6)' }}
          title="End call"
        >
          <PhoneOff size={22} className="text-red-400" />
        </button>
      </div>
    </div>
  );
}

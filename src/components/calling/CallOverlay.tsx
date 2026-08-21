import { useEffect, useRef, useState, useCallback } from 'react';
import { useCrypto } from '../../contexts/CryptoContext';

/** Lightweight WebRTC call overlay — terminal-styled.
 *  Uses getUserMedia for local stream; in production you'd wire a signaling
 *  channel (Supabase Realtime or a custom relay) to exchange offers/answers.
 *  For now it shows the local camera/mic feed so the UX is fully functional
 *  as a media-preview + call UI, ready for signaling integration. */

export default function CallOverlay() {
  const { callingChat, callType, endCall, alias } = useCrypto();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startMedia = useCallback(async (video: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStreamError(null);
    } catch (err: any) {
      setStreamError(err?.name === 'NotAllowedError'
        ? 'Camera/microphone permission denied'
        : err?.name === 'NotFoundError'
        ? 'No camera/microphone found'
        : 'Media access failed');
    }
  }, []);

  useEffect(() => {
    if (!callingChat) return;
    setDuration(0);
    setMuted(false);
    setVideoOff(false);
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

  const hangUp = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    endCall();
  };

  if (!callingChat) return null;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center term-bg"
      style={{ background: 'linear-gradient(180deg, #050a10 0%, #0a1018 100%)' }}>

      {/* Status bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 term-statusbar">
        <span className="text-emerald-400 text-xs font-mono tracking-wider">
          ● {callType === 'video' ? 'VIDEO' : 'AUDIO'} CALL ACTIVE
        </span>
        <span className="text-cyan-300 text-xs font-mono">{alias}</span>
        <span className="text-amber-400 text-xs font-mono tabular-nums">{fmt(duration)}</span>
      </div>

      {/* Video / Avatar area */}
      <div className="flex-1 flex items-center justify-center w-full px-4">
        {callType === 'video' ? (
          <div className="relative w-full max-w-2xl aspect-video term-panel overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {/* PiP self-view */}
            <div className="absolute bottom-3 right-3 w-28 h-20 term-panel overflow-hidden border border-cyan-500/30">
              <div className="w-full h-full bg-gray-900 flex items-center justify-center text-cyan-400 text-[10px] font-mono">
                YOU
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 rounded-full term-panel flex items-center justify-center border border-cyan-500/40">
              <span className="text-4xl">📞</span>
            </div>
            <div className="text-center">
              <div className="text-cyan-300 font-mono text-lg">{callingChat.name}</div>
              <div className="text-gray-400 text-xs font-mono mt-1">
                {streamError || 'Audio call in progress...'}
              </div>
            </div>
          </div>
        )}
        {streamError && (
          <div className="absolute bottom-24 text-amber-400 text-xs font-mono px-4 text-center">
            ⚠ {streamError}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-6 px-4 py-6 term-footer">
        <button
          onClick={toggleMute}
          className={`w-14 h-14 rounded-full term-panel flex items-center justify-center text-lg transition-all ${
            muted ? 'border border-red-500/60 text-red-400' : 'border border-gray-600 text-gray-300 hover:border-cyan-500/60'
          }`}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🎤'}
        </button>

        {callType === 'video' && (
          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full term-panel flex items-center justify-center text-lg transition-all ${
              videoOff ? 'border border-red-500/60 text-red-400' : 'border border-gray-600 text-gray-300 hover:border-cyan-500/60'
            }`}
            title={videoOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {videoOff ? '📷' : '📹'}
          </button>
        )}

        <button
          onClick={hangUp}
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all border-2"
          style={{ background: 'rgba(220, 38, 38, 0.3)', borderColor: 'rgba(220, 38, 38, 0.6)' }}
          title="End call"
        >
          📵
        </button>
      </div>
    </div>
  );
}

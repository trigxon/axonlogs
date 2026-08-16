import React, { useEffect, useRef, useState } from 'react';
import { Video, Mic, MicOff, VideoOff, X } from 'lucide-react';

export const VideoTunnel: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [streamError, setStreamError] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStreamError(true);
      return;
    }
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(s => {
        if (cancelled) {
          s.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = s;
        setStream(s);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = s;
        }
      })
      .catch(err => {
        console.error('Failed to get local stream', err);
        setStreamError(true);
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <div className="absolute top-0 right-0 m-4 w-64 bg-[#050505] border border-cyan-400/50 shadow-2xl z-40 flex flex-col rounded-sm overflow-hidden">
      <div className="flex justify-between items-center p-2 bg-cyan-950 border-b border-cyan-400/50">
        <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase flex items-center gap-2">
          <Video className="w-3 h-3" /> LOCAL PREVIEW // NO PEERS
        </span>
        <button onClick={onClose} className="text-cyan-400 hover:text-white"><X className="w-3 h-3" /></button>
      </div>
      <div className="relative aspect-video bg-black flex items-center justify-center">
        {streamError ? (
          <div className="text-[10px] text-zinc-500 font-mono px-4 text-center uppercase tracking-widest">
            [CAMERA UNAVAILABLE OR PERMISSION DENIED]
          </div>
        ) : (
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        )}
        {stream && (
          <div className="absolute bottom-2 left-2 flex gap-2">
            <button onClick={toggleMute} className={`p-1.5 rounded-full ${isMuted ? 'bg-red-500 text-white' : 'bg-black/50 text-white hover:bg-cyan-500'}`}>
              {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            </button>
            <button onClick={toggleVideo} className={`p-1.5 rounded-full ${isVideoOff ? 'bg-red-500 text-white' : 'bg-black/50 text-white hover:bg-cyan-500'}`}>
              {isVideoOff ? <VideoOff className="w-3 h-3" /> : <Video className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

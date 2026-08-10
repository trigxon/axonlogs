import React, { useEffect, useRef, useState } from 'react';
import { Video, Mic, MicOff, VideoOff, X } from 'lucide-react';

export const VideoTunnel: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(s => {
        setStream(s);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = s;
        }
      })
      .catch(err => console.error('Failed to get local stream', err));

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
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
    <div className="absolute top-0 right-0 m-4 w-64 bg-[#050505] border border-cyan-400/50 shadow-2xl z-40 flex flex-col rounded-sm overflow-hidden animate-pulse">
      <div className="flex justify-between items-center p-2 bg-cyan-950 border-b border-cyan-400/50">
        <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase flex items-center gap-2">
          <Video className="w-3 h-3" /> P2P TUNNEL: AWAITING PEERS
        </span>
        <button onClick={onClose} className="text-cyan-400 hover:text-white"><X className="w-3 h-3" /></button>
      </div>
      <div className="relative aspect-video bg-black flex items-center justify-center">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <div className="absolute bottom-2 left-2 flex gap-2">
          <button onClick={toggleMute} className={`p-1.5 rounded-full ${isMuted ? 'bg-red-500 text-white' : 'bg-black/50 text-white hover:bg-cyan-500'}`}>
            {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
          </button>
          <button onClick={toggleVideo} className={`p-1.5 rounded-full ${isVideoOff ? 'bg-red-500 text-white' : 'bg-black/50 text-white hover:bg-cyan-500'}`}>
            {isVideoOff ? <VideoOff className="w-3 h-3" /> : <Video className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </div>
  );
};

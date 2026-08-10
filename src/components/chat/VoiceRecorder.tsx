import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react';
import MicRecorder from 'mic-recorder-to-mp3';

export const VoiceRecorder: React.FC<{
  onRecordingComplete: (base64Audio: string) => void;
}> = ({ onRecordingComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const recorderRef = useRef<MicRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    recorderRef.current = new MicRecorder({ bitRate: 128 });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (recorderRef.current && isRecording) {
        recorderRef.current.stop();
      }
    };
  }, [audioUrl, isRecording]);

  const startRecording = async () => {
    try {
      if (recorderRef.current) {
        await recorderRef.current.start();
        setIsRecording(true);
        setError(null);
        
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      }
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setError('Mic access denied');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop().getMp3().then(([buffer]) => {
        const mp3Blob = new Blob(buffer, { type: 'audio/mp3' });
        setAudioBlob(mp3Blob);
        const url = URL.createObjectURL(mp3Blob);
        setAudioUrl(url);
        setIsRecording(false);
        clearInterval(timerRef.current);
      }).catch((e: any) => {
        console.error('Error compiling MP3:', e);
      });
    }
  };

  const deleteRecording = () => {
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordingTime(0);
    setIsPlaying(false);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSend = () => {
    if (audioBlob) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result as string;
        onRecordingComplete(base64Audio);
        deleteRecording();
      };
      reader.readAsDataURL(audioBlob);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-red-500 text-xs px-2">{error}</span>}
      
      {!audioUrl && !isRecording && (
        <button
          onClick={startRecording}
          title="Record Encrypted Voice Memo"
          className="p-2 text-zinc-500 hover:text-cyan-400 transition-colors rounded-sm hover:bg-white/5"
        >
          <Mic size={20} />
        </button>
      )}

      {isRecording && (
        <div className="flex items-center gap-3 bg-red-950/30 border border-red-500/50 px-3 py-1 rounded-sm animate-pulse">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-red-400 text-xs font-mono w-12">{formatTime(recordingTime)}</span>
          <button
            onClick={stopRecording}
            className="p-1 hover:bg-red-500/20 text-red-400 rounded transition-colors"
          >
            <Square size={16} fill="currentColor" />
          </button>
        </div>
      )}

      {audioUrl && (
        <div className="flex items-center gap-2 bg-[#1a1a1a] border border-cyan-500/30 p-1 pl-2 rounded-sm pr-2">
          <button onClick={togglePlayback} className="p-1.5 text-cyan-400 hover:bg-cyan-500/20 rounded">
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          
          <div className="h-1 w-16 bg-zinc-800 rounded-full overflow-hidden relative">
            <div className={`absolute top-0 bottom-0 left-0 bg-cyan-500 ${isPlaying ? 'w-full duration-[10s] ease-linear transition-all' : 'w-0'}`} />
          </div>
          
          <span className="text-cyan-400 text-[10px] font-mono mx-2">{formatTime(recordingTime)}</span>
          
          <audio 
            ref={audioRef} 
            src={audioUrl} 
            onEnded={() => setIsPlaying(false)}
            className="hidden" 
          />

          <button onClick={deleteRecording} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded ml-1 transition-colors">
            <Trash2 size={14} />
          </button>
          
          <button 
            onClick={handleSend}
            className="ml-2 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold tracking-wider transition-colors"
          >
            ENCRYPT
          </button>
        </div>
      )}
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react';

// Pick the best supported audio container for the current browser.
// WebM/Opus covers Chrome/Firefox/Edge; Safari falls back to mp4/AAC.
const pickMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
};

export const VoiceRecorder: React.FC<{
  onRecordingComplete: (base64Audio: string) => void;
}> = ({ onRecordingComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          /* already stopped */
        }
      }
      recorderRef.current = null;
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const type = (recorder.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunksRef.current, { type });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setIsRecording(false);
        setRecordingTime(0);
        clearInterval(timerRef.current);
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
      setError(null);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setError('Mic access denied');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
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
        onRecordingComplete(reader.result as string);
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

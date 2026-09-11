import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Gauge,
} from "lucide-react";

interface AudioPlaybackBarProps {
  audioUrl: string | null;
  fileName?: string;
  duration: number;
  seekToTime?: number | null;
  onTimeUpdate?: (currentTime: number) => void;
}

export function AudioPlaybackBar({
  audioUrl,
  fileName,
  duration,
  seekToTime,
  onTimeUpdate,
}: AudioPlaybackBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (seekToTime !== null && seekToTime !== undefined && audioRef.current) {
      audioRef.current.currentTime = seekToTime;
      setCurrentTime(seekToTime);
      if (!isPlaying) {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  }, [seekToTime]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const time = audioRef.current.currentTime;
    setCurrentTime(time);
    onTimeUpdate?.(time);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    onTimeUpdate?.(time);
  };

  const handleRateChange = () => {
    const rates = [0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
  };

  if (!audioUrl) return null;

  const totalDuration = duration > 0 ? duration : audioRef.current?.duration || 1;

  return (
    <div className="rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-4 shadow-sm">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <div className="mb-3 flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <p className="truncate font-mono text-xs font-bold text-[#263b48]">
            {fileName || "Loaded Audio"}
          </p>
          <p className="text-[10px] text-[#737b77]">
            Playback aligned with word timestamps
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRateChange}
            className="flex items-center gap-1 rounded-lg border border-[#c9c9be] bg-[#f3f0e7] px-2 py-1 text-[10px] font-bold text-[#263b48] hover:bg-[#e9e4d8]"
            title="Toggle playback speed"
          >
            <Gauge size={12} />
            <span>{playbackRate}x</span>
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="rounded-lg p-1.5 text-[#737b77] hover:bg-[#e9e4d8] hover:text-[#263b48]"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#263b48] text-[#fffaf0] shadow-sm transition hover:bg-[#1a2933]"
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>

        <div className="flex flex-1 items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] font-bold text-[#263b48]">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max={totalDuration}
            step="0.05"
            value={currentTime}
            onChange={handleSeek}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[#d5d4cb] accent-[#e85b48]"
          />
          <span className="shrink-0 font-mono text-[11px] text-[#737b77]">
            {formatTime(totalDuration)}
          </span>
        </div>
      </div>
    </div>
  );
}

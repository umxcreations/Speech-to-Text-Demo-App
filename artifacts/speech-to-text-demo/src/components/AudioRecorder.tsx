import { useState, useRef, useEffect } from "react";
import { Mic, Square, Pause, Play, AlertCircle, Loader2 } from "lucide-react";

interface AudioRecorderProps {
  onRecordingComplete: (file: File, duration: number) => void;
  disabled?: boolean;
}

export function AudioRecorder({
  onRecordingComplete,
  disabled = false,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    setPermissionError(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Check supported MIME type
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
        mimeType = "audio/ogg";
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        // Stop all audio tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());

        const duration = (Date.now() - startTimeRef.current) / 1000;
        const extension = mimeType.includes("mp4")
          ? "m4a"
          : mimeType.includes("ogg")
          ? "ogg"
          : "webm";
        const file = new File([audioBlob], `mic-recording-${Date.now()}.${extension}`, {
          type: mimeType,
        });

        onRecordingComplete(file, Math.max(1, duration));
        setIsRecording(false);
        setIsPaused(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };

      mediaRecorder.start(250); // Slice chunks every 250ms
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone error:", err);
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        setPermissionError(
          "Microphone access was denied. Please allow microphone permissions in your browser or choose an audio file instead."
        );
      } else {
        setPermissionError(
          `Unable to access microphone: ${err.message || "Unknown error"}`
        );
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-2">
      {!isRecording ? (
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          className="flex items-center justify-center gap-2 rounded-xl border border-[#c9c9be] bg-[#fffaf0] px-4 py-2.5 text-xs font-bold text-[#263b48] shadow-sm transition hover:border-[#e85b48] hover:bg-[#fff5f2] disabled:opacity-50"
        >
          <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#e85b48]">
            <Mic size={9} className="text-[#fffaf0]" />
          </div>
          <span>Record from Microphone</span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#efc4bb] bg-[#fff0ec] px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e85b48] opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-[#e85b48]" />
            </span>
            <span className="font-mono text-xs font-bold text-[#9f4438]">
              {formatTimer(recordingTime)}
            </span>
            <span className="text-[11px] text-[#9f4438]/80">
              {isPaused ? "(Paused)" : "Recording..."}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isPaused ? (
              <button
                type="button"
                onClick={resumeRecording}
                className="flex items-center gap-1 rounded-lg bg-[#ded8cb] px-2.5 py-1 text-xs font-bold text-[#263b48] hover:bg-[#c9c9be]"
              >
                <Play size={11} /> Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={pauseRecording}
                className="flex items-center gap-1 rounded-lg bg-[#ded8cb] px-2.5 py-1 text-xs font-bold text-[#263b48] hover:bg-[#c9c9be]"
              >
                <Pause size={11} /> Pause
              </button>
            )}
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-1 rounded-lg bg-[#e85b48] px-3 py-1 text-xs font-bold text-[#fffaf0] shadow-sm hover:bg-[#d44835]"
            >
              <Square size={11} fill="currentColor" /> Stop & Transcribe
            </button>
          </div>
        </div>
      )}

      {permissionError && (
        <div className="flex items-start gap-2 rounded-xl border border-[#efc4bb] bg-[#fff0ec] p-3 text-xs text-[#9f4438]">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{permissionError}</span>
        </div>
      )}
    </div>
  );
}

import { useRef, useState, useEffect, useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  AudioLines,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  Cpu,
  Download,
  FileAudio,
  FileCode2,
  FileText,
  Info,
  Key,
  Languages,
  LoaderCircle,
  Mic,
  MousePointer2,
  Play,
  Pause,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  UploadCloud,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  fetchGroqConfig,
  transcribeWithGroq,
  transcribeDemo,
  type GroqConfig,
  type TranscriptionResult,
  type TranscriptSegment,
  type WordTimestamp,
} from "./lib/groq-api";
import {
  AUDIO_PRESETS,
  generatePresetAudioFile,
  type AudioPreset,
} from "./lib/audio-presets";
import {
  generateSRT,
  generateVTT,
  downloadTextFile,
  downloadJSONFile,
} from "./lib/export-utils";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { AudioRecorder } from "./components/AudioRecorder";
import { AudioPlaybackBar } from "./components/AudioPlaybackBar";

const queryClient = new QueryClient();

type PipelineMode = "groq" | "demo";
type DemoStep = "ready" | "inspect" | "request" | "result";

interface AudioInputState {
  file: File | null;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  objectUrl: string | null;
  isPreset?: boolean;
  isRecording?: boolean;
}

const LANGUAGES = [
  { code: "", name: "Auto-detect language" },
  { code: "en", name: "English (en)" },
  { code: "es", name: "Spanish (es)" },
  { code: "fr", name: "French (fr)" },
  { code: "de", name: "German (de)" },
  { code: "it", name: "Italian (it)" },
  { code: "pt", name: "Portuguese (pt)" },
  { code: "nl", name: "Dutch (nl)" },
  { code: "ja", name: "Japanese (ja)" },
  { code: "zh", name: "Chinese (zh)" },
  { code: "hi", name: "Hindi (hi)" },
  { code: "ar", name: "Arabic (ar)" },
  { code: "ru", name: "Russian (ru)" },
  { code: "ko", name: "Korean (ko)" },
  { code: "tr", name: "Turkish (tr)" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${remaining.toFixed(1).padStart(4, "0")}`;
}

function formatClockTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 10);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${millis}`;
}

function StepMarker({
  number,
  label,
  description,
  state,
  onClick,
}: {
  number: string;
  label: string;
  description: string;
  state: "complete" | "current" | "upcoming";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`group flex w-full items-start gap-3 text-left ${
        onClick ? "cursor-pointer" : "cursor-default"
      }`}
      onClick={onClick}
      data-testid={`step-${number.toLowerCase()}${onClick ? "-button" : ""}`}
    >
      <span
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold transition-colors ${
          state === "complete"
            ? "border-[#263b48] bg-[#263b48] text-[#f7f3e9]"
            : state === "current"
            ? "border-[#e85b48] bg-[#e85b48] text-[#fffaf0]"
            : "border-[#c7c9c7] bg-[#f7f3e9] text-[#767b80] group-hover:border-[#e85b48]"
        }`}
      >
        {state === "complete" ? <Check size={15} strokeWidth={3} /> : number}
      </span>
      <span className="min-w-0 pt-0.5">
        <span
          className={`block text-sm font-bold ${
            state === "upcoming" ? "text-[#767b80]" : "text-[#263b48]"
          }`}
        >
          {label}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-[#767b80]">
          {description}
        </span>
      </span>
    </Tag>
  );
}

function Header({
  pipelineMode,
  setPipelineMode,
  hasServerKey,
  maskedKey,
  customKey,
  onOpenKeyModal,
  onReset,
}: {
  pipelineMode: PipelineMode;
  setPipelineMode: (mode: PipelineMode) => void;
  hasServerKey: boolean;
  maskedKey: string | null;
  customKey: string;
  onOpenKeyModal: () => void;
  onReset: () => void;
}) {
  const isKeyActive = Boolean(customKey || hasServerKey);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d9d9d2] px-5 py-4 lg:px-10">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e85b48] text-[#fffaf0] shadow-[3px_3px_0_#263b48]">
          <AudioLines size={22} strokeWidth={2.4} />
        </div>
        <div>
          <div className="flex items-center gap-2 font-mono text-sm font-bold tracking-tight text-[#263b48]">
            <span>signal</span>
            <span className="text-[#e85b48]">/</span>
            <span>groq-stt</span>
            <span className="rounded bg-[#263b48]/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#263b48]">
              LPU Inference
            </span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a8c88]">
            Speech-to-text pipeline
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Pipeline engine mode selector */}
        <div className="flex items-center rounded-xl border border-[#d9d9d2] bg-[#fffaf0] p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setPipelineMode("groq")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              pipelineMode === "groq"
                ? "bg-[#263b48] text-[#fffaf0] shadow-sm"
                : "text-[#6b716f] hover:text-[#263b48]"
            }`}
          >
            <Zap size={13} className={pipelineMode === "groq" ? "text-[#e85b48]" : ""} />
            <span>Groq Whisper</span>
          </button>
          <button
            type="button"
            onClick={() => setPipelineMode("demo")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              pipelineMode === "demo"
                ? "bg-[#263b48] text-[#fffaf0] shadow-sm"
                : "text-[#6b716f] hover:text-[#263b48]"
            }`}
          >
            <Sparkles size={13} />
            <span>Demo Fixture</span>
          </button>
        </div>

        {/* API key button / status */}
        <button
          type="button"
          onClick={onOpenKeyModal}
          className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
            isKeyActive
              ? "border-[#b9d8cb] bg-[#e8f3ed] text-[#24634c] hover:bg-[#d8ece1]"
              : "border-[#efc4bb] bg-[#fff0ec] text-[#9f4438] hover:bg-[#ffe3dc]"
          }`}
          title="Configure or test Groq API Key"
        >
          <Key size={13} />
          <span>
            {customKey
              ? "Custom Key (Active)"
              : hasServerKey
              ? `Groq: ${maskedKey || "Configured"}`
              : "Set Groq API Key"}
          </span>
          <span
            className={`h-2 w-2 rounded-full ${
              isKeyActive ? "bg-[#368064]" : "bg-[#cf5141] animate-pulse"
            }`}
          />
        </button>

        {/* Reset button */}
        <button
          type="button"
          onClick={onReset}
          className="group flex items-center gap-1.5 rounded-xl border border-transparent px-3 py-2 text-xs font-bold text-[#6b716f] transition-colors hover:border-[#d9d9d2] hover:bg-[#fffaf0] hover:text-[#263b48]"
          data-testid="button-reset-demo"
        >
          <RotateCcw size={14} className="transition-transform group-hover:-rotate-45" />
          <span>Reset</span>
        </button>
      </div>
    </header>
  );
}

function Readiness({
  status,
  isLoading,
  isError,
  hasGroqKey,
  pipelineMode,
  onRetry,
}: {
  status?: string;
  isLoading: boolean;
  isError: boolean;
  hasGroqKey: boolean;
  pipelineMode: PipelineMode;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-y border-[#d9d9d2] bg-[#e8f0ed] px-5 py-3 lg:px-10"
      data-testid="status-service-readiness"
    >
      <div className="flex items-center gap-3">
        <span
          className={`relative flex h-7 w-7 items-center justify-center rounded-full ${
            isError
              ? "bg-[#f4d7cf] text-[#b74839]"
              : "bg-[#c5e1d5] text-[#28684f]"
          }`}
        >
          {isLoading ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : isError ? (
            <AlertTriangle size={15} />
          ) : (
            <ShieldCheck size={15} />
          )}
          {!isLoading && !isError && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-[#e8f0ed] bg-[#4b9a78]" />
          )}
        </span>
        <div>
          <p className="text-xs font-bold text-[#263b48]">
            {isLoading
              ? "Checking transcription service..."
              : isError
              ? "Service check needs a retry"
              : pipelineMode === "groq"
              ? "Groq Whisper STT pipeline ready (LPU Acceleration Active)"
              : "Deterministic demo fixture ready"}
          </p>
          <p className="text-[11px] text-[#5c716d]">
            {isError
              ? "The API server did not answer. Please retry."
              : pipelineMode === "groq"
              ? hasGroqKey
                ? "Production Groq endpoints connected: POST /api/transcribe with sub-second latency."
                : "Groq API key not detected. Click 'Set Groq API Key' in the header to connect."
              : "Local deterministic mode returns structured word timestamps immediately."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] text-[#61817a]">
          {status ? `healthz · ${status}` : "healthz · checking"}
        </span>
        {isError && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1 rounded-md bg-[#263b48] px-2.5 py-1.5 text-[11px] font-bold text-[#fffaf0]"
            data-testid="button-retry-health"
          >
            <RefreshCw size={12} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}

function CodePanel({
  input,
  result,
  requestParams,
}: {
  input: AudioInputState;
  result?: TranscriptionResult;
  requestParams?: any;
}) {
  const [copied, setCopied] = useState(false);
  const payload = JSON.stringify(
    result
      ? {
          request: {
            fileName: input.fileName,
            mimeType: input.mimeType,
            fileSizeBytes: input.fileSizeBytes,
            durationSeconds: input.durationSeconds,
            ...requestParams,
          },
          response: {
            jobId: result.jobId,
            model: result.model,
            detectedLanguage: result.detectedLanguage,
            durationSeconds: result.audioDurationSeconds,
            metrics: result.metrics,
            segmentsCount: result.segments.length,
            sampleSegment: result.segments[0],
          },
        }
      : {
          audio: {
            fileName: input.fileName,
            mimeType: input.mimeType,
            fileSizeBytes: input.fileSizeBytes,
            durationSeconds: input.durationSeconds,
          },
          pipeline: requestParams,
        },
    null,
    2
  );

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[#304957] bg-[#263b48] shadow-[0_12px_30px_rgba(38,59,72,.14)]"
      data-testid="panel-technical-payload"
    >
      <div className="flex items-center justify-between border-b border-[#49616a] px-4 py-3">
        <div className="flex items-center gap-2 text-[#d7e6df]">
          <Terminal size={14} />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
            Groq API payload contract
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(payload);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold text-[#b4c7c4] hover:bg-[#385460] hover:text-[#fffaf0]"
          data-testid="button-copy-payload"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy JSON"}</span>
        </button>
      </div>
      <pre
        className="max-h-64 overflow-auto p-4 font-mono text-[10px] leading-5 text-[#cfe1d9]"
        data-testid="text-technical-payload"
      >
        <code>{payload}</code>
      </pre>
    </div>
  );
}

function SegmentRow({
  segment,
  open,
  isActive,
  onToggle,
  onWordClick,
}: {
  segment: TranscriptSegment;
  open: boolean;
  isActive: boolean;
  onToggle: () => void;
  onWordClick?: (time: number) => void;
}) {
  return (
    <div
      className={`group transition-colors ${
        isActive ? "bg-[#fff2ed] border-l-4 border-[#e85b48]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#faf6ed] sm:px-5"
        data-testid={`button-segment-${segment.id}`}
      >
        <span className="font-mono mt-0.5 w-14 shrink-0 text-[10px] font-bold text-[#e85b48]">
          {formatSeconds(segment.start)}
        </span>
        <span className="flex-1 text-sm leading-6 text-[#3e4c51]">
          {segment.text}
        </span>
        <div className="flex items-center gap-2">
          {segment.words && segment.words.length > 0 && (
            <span className="rounded bg-[#263b48]/5 px-2 py-0.5 font-mono text-[9px] font-bold text-[#737b77]">
              {segment.words.length} words
            </span>
          )}
          <ChevronDown
            size={16}
            className={`shrink-0 text-[#89918e] transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open && (
        <div className="bg-[#f5f8f3] px-4 pb-4 pt-1 sm:px-5">
          <div className="ml-4 overflow-x-auto rounded-xl border border-[#d4e0d8] bg-[#fffaf0]">
            <div className="grid min-w-[500px] grid-cols-[1.2fr_1fr_1fr_.8fr_auto] border-b border-[#e3e1d8] px-3 py-2 font-mono text-[9px] uppercase tracking-[.1em] text-[#82918a]">
              <span>Word</span>
              <span>Start</span>
              <span>End</span>
              <span>Confidence</span>
              <span>Seek</span>
            </div>
            {segment.words && segment.words.length > 0 ? (
              segment.words.map((word, index) => (
                <div
                  key={`${segment.id}-${index}`}
                  className={`grid min-w-[500px] grid-cols-[1.2fr_1fr_1fr_.8fr_auto] items-center px-3 py-2 text-xs ${
                    index % 2 ? "bg-[#fbf8f0]" : ""
                  }`}
                >
                  <span className="font-bold text-[#324b51]">{word.word}</span>
                  <span className="font-mono text-[10px] text-[#77847f]">
                    {formatClockTime(word.start)}
                  </span>
                  <span className="font-mono text-[10px] text-[#77847f]">
                    {formatClockTime(word.end)}
                  </span>
                  <span className="font-mono text-[10px] font-bold text-[#4b8068]">
                    {(word.probability * 100).toFixed(0)}%
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onWordClick?.(word.start);
                    }}
                    className="flex items-center gap-1 rounded bg-[#e9e4d8] px-2 py-0.5 text-[10px] font-bold text-[#263b48] hover:bg-[#ded8cb]"
                  >
                    <Play size={8} /> Play
                  </button>
                </div>
              ))
            ) : (
              <div className="p-3 text-center text-xs text-[#737b77]">
                Word-level timestamps not populated for this segment.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultStat({
  label,
  value,
  monoValue = false,
  highlight = false,
}: {
  label: string;
  value: string;
  monoValue?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${
        highlight
          ? "border-[#b9d8cb] bg-[#e8f3ed]"
          : "border-[#d5d4cb] bg-[#f5f1e8]"
      }`}
      data-testid={`stat-${label.replaceAll(" ", "-")}`}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#818681]">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-bold ${
          highlight ? "text-[#24634c]" : "text-[#263b48]"
        } ${monoValue ? "font-mono text-[11px]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export function DemoApp() {
  const health = useHealthCheck();
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("groq");

  // Groq config & custom keys
  const [groqConfig, setGroqConfig] = useState<GroqConfig | null>(null);
  const [customKey, setCustomKey] = useState<string>(() => {
    return localStorage.getItem("groq_custom_api_key") || "";
  });
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  // Model & transcription parameters
  const [selectedModel, setSelectedModel] = useState("whisper-large-v3");
  const [language, setLanguage] = useState("");
  const [promptContext, setPromptContext] = useState("");
  const [temperature, setTemperature] = useState(0);

  // Audio input state
  const [input, setInput] = useState<AudioInputState | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [fileError, setFileError] = useState("");
  const [isPresetLoading, setIsPresetLoading] = useState(false);

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [openSegment, setOpenSegment] = useState<number | null>(0);

  // Audio playback & live sync
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Groq server configuration on mount
  useEffect(() => {
    fetchGroqConfig()
      .then((cfg) => {
        setGroqConfig(cfg);
        if (cfg.defaultModel) {
          setSelectedModel(cfg.defaultModel);
        }
      })
      .catch((err) => {
        console.error("Failed to load Groq config:", err);
      });
  }, []);

  const handleSaveCustomKey = (key: string) => {
    setCustomKey(key);
    if (key) {
      localStorage.setItem("groq_custom_api_key", key);
    } else {
      localStorage.removeItem("groq_custom_api_key");
    }
  };

  const reset = () => {
    if (input?.objectUrl) {
      URL.revokeObjectURL(input.objectUrl);
    }
    setInput(null);
    setResult(null);
    setTranscribeError(null);
    setFileError("");
    setIsInspecting(false);
    setCurrentPlaybackTime(0);
    setSeekTime(null);
  };

  const analyzeFile = (file: File, isPreset = false, isRecording = false) => {
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|m4a|ogg|webm|flac|aac)$/i)) {
      setFileError("That file does not look like audio. Choose an MP3, WAV, M4A, OGG, or WebM file.");
      return;
    }

    setFileError("");
    setIsInspecting(true);

    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";

    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setInput({
        file,
        fileName: file.name,
        mimeType: file.type || "audio/wav",
        fileSizeBytes: file.size,
        durationSeconds: duration,
        objectUrl,
        isPreset,
        isRecording,
      });
      setIsInspecting(false);
    };

    audio.onerror = () => {
      // Fallback: estimate or use file without duration
      setInput({
        file,
        fileName: file.name,
        mimeType: file.type || "audio/wav",
        fileSizeBytes: file.size,
        durationSeconds: 5,
        objectUrl,
        isPreset,
        isRecording,
      });
      setIsInspecting(false);
    };

    audio.src = objectUrl;
  };

  const handlePresetSelect = async (preset: AudioPreset) => {
    setIsPresetLoading(true);
    setFileError("");
    try {
      const sampleFile = await generatePresetAudioFile(preset);
      if (preset.suggestedPrompt) {
        setPromptContext(preset.suggestedPrompt);
      }
      analyzeFile(sampleFile, true, false);
    } catch (err: any) {
      console.error("Failed to generate preset audio:", err);
      setFileError("Failed to initialize audio preset.");
    } finally {
      setIsPresetLoading(false);
    }
  };

  const handleRunTranscription = async () => {
    if (!input) return;
    setIsTranscribing(true);
    setTranscribeError(null);

    try {
      if (pipelineMode === "demo") {
        // Run deterministic demo fixture
        const demoRes = await transcribeDemo({
          fileName: input.fileName,
          fileSizeBytes: input.fileSizeBytes,
          durationSeconds: input.durationSeconds,
          language: language || undefined,
        });
        setResult(demoRes);
      } else {
        // Run Real Groq STT Whisper
        const activeKey = customKey.trim() || undefined;
        const res = await transcribeWithGroq({
          file: input.file || undefined,
          fileName: input.fileName,
          mimeType: input.mimeType,
          model: selectedModel,
          language: language || undefined,
          prompt: promptContext || undefined,
          temperature,
          apiKey: activeKey,
        });
        setResult(res);
      }
    } catch (err: any) {
      console.error("Transcription error:", err);
      setTranscribeError(
        err.message || "Transcription failed. Please check your Groq API key or try another audio file."
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  // Active segment and word based on playback
  const activeSegment = useMemo(() => {
    if (!result || !result.segments) return null;
    return (
      result.segments.find(
        (seg) =>
          currentPlaybackTime >= seg.start && currentPlaybackTime <= seg.end
      ) || null
    );
  }, [result, currentPlaybackTime]);

  const filteredSegments = useMemo(() => {
    if (!result?.segments) return [];
    if (!searchQuery.trim()) return result.segments;
    const q = searchQuery.toLowerCase();
    return result.segments.filter((seg) =>
      seg.text.toLowerCase().includes(q)
    );
  }, [result, searchQuery]);

  const hasResult = Boolean(result);
  const currentStep: DemoStep = hasResult
    ? "result"
    : isTranscribing
    ? "request"
    : input
    ? "inspect"
    : "ready";

  const jumpTo = (step: DemoStep) => {
    if (step === "ready") {
      document
        .getElementById("service-ready")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (step === "inspect" && input) {
      document
        .getElementById("audio-input")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (step === "result" && result) {
      document
        .getElementById("results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f3f0e7] text-[#263b48]">
      <div className="noise-overlay" />

      <Header
        pipelineMode={pipelineMode}
        setPipelineMode={setPipelineMode}
        hasServerKey={Boolean(groqConfig?.hasGroqKey)}
        maskedKey={groqConfig?.maskedKey || null}
        customKey={customKey}
        onOpenKeyModal={() => setIsKeyModalOpen(true)}
        onReset={reset}
      />

      <Readiness
        status={health.data?.status}
        isLoading={health.isLoading}
        isError={health.isError}
        hasGroqKey={Boolean(groqConfig?.hasGroqKey || customKey)}
        pipelineMode={pipelineMode}
        onRetry={() => void health.refetch()}
      />

      <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-8 lg:px-10 lg:pt-12">
        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-14">
          {/* Step navigator sidebar */}
          <aside className="lg:sticky lg:top-8 lg:h-fit">
            <div className="mb-5 flex items-center gap-2 text-[#e85b48]">
              <Activity size={15} />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
                pipeline stages
              </span>
            </div>
            <nav className="space-y-5" aria-label="Pipeline steps">
              <StepMarker
                number="01"
                label="Engine ready"
                description={
                  pipelineMode === "groq"
                    ? "Groq LPU active"
                    : "Demo endpoint"
                }
                state={currentStep === "ready" ? "current" : "complete"}
                onClick={() => jumpTo("ready")}
              />
              <StepMarker
                number="02"
                label="Inspect audio"
                description="Upload, record or preset"
                state={
                  input
                    ? "complete"
                    : currentStep === "inspect"
                    ? "current"
                    : "upcoming"
                }
                onClick={() => jumpTo("inspect")}
              />
              <StepMarker
                number="03"
                label="Groq Whisper"
                description="Sub-second inference"
                state={
                  hasResult
                    ? "complete"
                    : currentStep === "request"
                    ? "current"
                    : "upcoming"
                }
                onClick={input ? handleRunTranscription : undefined}
              />
              <StepMarker
                number="04"
                label="Explore transcript"
                description="Word timestamps & export"
                state={hasResult ? "complete" : "upcoming"}
                onClick={() => jumpTo("result")}
              />
            </nav>

            {/* Hardware badge */}
            <div className="mt-8 rounded-2xl border border-[#d7d6ce] bg-[#fffaf0] p-4">
              <div className="mb-2 flex items-center gap-2 text-[#263b48]">
                <Cpu size={15} className="text-[#e85b48]" />
                <span className="text-xs font-bold">Groq LPU Acceleration</span>
              </div>
              <p className="text-[11px] leading-5 text-[#777c79]">
                Processes audio speech-to-text at up to 750 words per minute
                with real-time word alignments.
              </p>
            </div>
          </aside>

          {/* Main workspace */}
          <div className="min-w-0">
            <section id="service-ready" className="animate-rise-in mb-8">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#263b48] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-[#f7f3e9]">
                  {pipelineMode === "groq"
                    ? "Production Groq STT"
                    : "Deterministic fixture"}
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7b827f]">
                  <MousePointer2 size={12} /> Whisper Large v3 · Word timestamps
                </span>
              </div>
              <h1 className="max-w-4xl text-[clamp(2.5rem,5.5vw,5.2rem)] font-bold leading-[.95] tracking-[-0.06em] text-[#263b48]">
                Turn human voice
                <br />
                <span className="text-[#e85b48]">into aligned signal.</span>
              </h1>
              <div className="mt-5 flex max-w-3xl flex-col gap-3 border-l-2 border-[#e85b48] pl-4 sm:flex-row sm:items-start sm:gap-7 sm:pl-5">
                <p className="text-base leading-7 text-[#4e5b60] sm:max-w-md">
                  A production-grade speech-to-text pipeline powered by Groq's
                  ultra-low-latency Whisper models, exposing word alignments,
                  confidence scores, and subtitles.
                </p>
                <p className="font-mono max-w-md text-[11px] leading-5 text-[#7b827f]">
                  <span className="font-bold text-[#263b48]">Workflow:</span>{" "}
                  Record or upload audio → Stream to Groq LPU → Synchronized
                  interactive playback & subtitle export.
                </p>
              </div>
            </section>

            {/* Pipeline Configuration Panel */}
            <section className="mb-6 rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders size={15} className="text-[#e85b48]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#263b48]">
                    Inference Settings
                  </h3>
                </div>
                <span className="rounded-full bg-[#f3f0e7] px-2 py-0.5 font-mono text-[10px] font-bold text-[#737b77]">
                  {selectedModel}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {/* Model Selector */}
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#263b48]">
                    Whisper Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full rounded-xl border border-[#c9c9be] bg-[#f9f6ef] px-3 py-2 text-xs font-bold text-[#263b48] outline-none focus:border-[#e85b48]"
                  >
                    <option value="whisper-large-v3">
                      whisper-large-v3 (Highest Accuracy)
                    </option>
                    <option value="whisper-large-v3-turbo">
                      whisper-large-v3-turbo (Ultra-Fast)
                    </option>
                  </select>
                  <p className="mt-1 text-[10px] text-[#737b77]">
                    Multilingual audio transcription
                  </p>
                </div>

                {/* Language hint */}
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#263b48]">
                    Language Hint
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-xl border border-[#c9c9be] bg-[#f9f6ef] px-3 py-2 text-xs font-bold text-[#263b48] outline-none focus:border-[#e85b48]"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-[#737b77]">
                    Optional hint for vocabulary & accents
                  </p>
                </div>

                {/* Temperature slider */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="mb-1 block text-xs font-bold text-[#263b48]">
                      Temperature: {temperature}
                    </label>
                    <span className="font-mono text-[10px] text-[#737b77]">
                      {temperature === 0 ? "Strict" : "Adaptive"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[#d5d4cb] accent-[#e85b48]"
                  />
                  <p className="mt-1 text-[10px] text-[#737b77]">
                    0.0 for deterministic output
                  </p>
                </div>
              </div>

              {/* Context Prompt (Optional Vocabulary) */}
              <div className="mt-3 border-t border-[#e8e4d8] pt-3">
                <label className="mb-1 block text-xs font-bold text-[#263b48]">
                  Context Prompt / Domain Vocabulary (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Groq, Whisper, PyTorch, Kubernetes, Dr. Smith"
                  value={promptContext}
                  onChange={(e) => setPromptContext(e.target.value)}
                  className="w-full rounded-xl border border-[#c9c9be] bg-[#f9f6ef] px-3 py-2 font-mono text-xs text-[#263b48] outline-none focus:border-[#e85b48]"
                />
              </div>
            </section>

            {/* Input Selection Stage */}
            {!hasResult && (
              <div className="space-y-5">
                <section
                  id="audio-input"
                  className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]"
                >
                  {/* File Dropzone & Recorder */}
                  <div className="rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-4 shadow-sm sm:p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fbe2dc] text-[#cf5141]">
                            <UploadCloud size={15} />
                          </div>
                          <h3 className="text-sm font-bold text-[#263b48]">
                            Audio Input Source
                          </h3>
                        </div>
                        <p className="text-xs leading-5 text-[#777c79]">
                          Upload a recording, use your live microphone, or choose a
                          sample preset.
                        </p>
                      </div>
                      {input && (
                        <button
                          type="button"
                          onClick={() => {
                            if (input.objectUrl) URL.revokeObjectURL(input.objectUrl);
                            setInput(null);
                          }}
                          className="rounded-md p-1.5 text-[#929793] hover:bg-[#f0ece2] hover:text-[#263b48]"
                          aria-label="Clear selected audio"
                          data-testid="button-clear-audio"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>

                    {input ? (
                      <div
                        className="animate-rise-in space-y-3 rounded-xl border border-[#b9d8cb] bg-[#edf6f1] p-4"
                        data-testid="card-audio-inspection"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#263b48] text-[#d8eddf]">
                            <FileAudio size={22} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className="truncate text-sm font-bold text-[#263b48]"
                                data-testid="text-audio-filename"
                              >
                                {input.fileName}
                              </p>
                              {input.isPreset && (
                                <span className="rounded-full bg-[#f3d95f] px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-[#263b48]">
                                  Preset
                                </span>
                              )}
                              {input.isRecording && (
                                <span className="rounded-full bg-[#e85b48] px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-[#fffaf0]">
                                  Microphone
                                </span>
                              )}
                            </div>
                            <p className="font-mono mt-1 text-[10px] text-[#668079]">
                              {input.mimeType} · {formatBytes(input.fileSizeBytes)}
                            </p>
                          </div>
                          {isInspecting ? (
                            <LoaderCircle
                              size={17}
                              className="animate-spin text-[#e85b48]"
                            />
                          ) : (
                            <CheckCircle2 size={18} className="text-[#4b9a78]" />
                          )}
                        </div>

                        {/* Audio preview player */}
                        {input.objectUrl && (
                          <div className="pt-2">
                            <AudioPlaybackBar
                              audioUrl={input.objectUrl}
                              fileName={input.fileName}
                              duration={input.durationSeconds}
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2 border-t border-[#cee3d8] pt-3">
                          <div>
                            <p className="font-mono flex items-center gap-1 text-[9px] uppercase tracking-[0.1em] text-[#799188]">
                              <Clock3 size={11} /> duration
                            </p>
                            <p className="mt-1 text-xs font-bold text-[#263b48]">
                              {formatSeconds(input.durationSeconds)}
                            </p>
                          </div>
                          <div>
                            <p className="font-mono flex items-center gap-1 text-[9px] uppercase tracking-[0.1em] text-[#799188]">
                              <Languages size={11} /> language
                            </p>
                            <p className="mt-1 text-xs font-bold text-[#263b48]">
                              {language || "Auto-detect"}
                            </p>
                          </div>
                          <div>
                            <p className="font-mono flex items-center gap-1 text-[9px] uppercase tracking-[0.1em] text-[#799188]">
                              <Zap size={11} /> model
                            </p>
                            <p className="mt-1 truncate text-xs font-bold text-[#263b48]">
                              {selectedModel}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files?.[0];
                            if (file) analyzeFile(file);
                          }}
                          className="group relative flex min-h-[140px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#a9bdb6] bg-[#f2f7f3] px-4 text-center transition-all hover:border-[#e85b48] hover:bg-[#fff4ed]"
                          data-testid="button-select-audio"
                        >
                          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#fffaf0] text-[#e85b48] shadow-sm transition-transform group-hover:-translate-y-1">
                            <FileAudio size={20} />
                          </div>
                          <span className="text-sm font-bold text-[#263b48]">
                            Drop audio file here
                          </span>
                          <span className="mt-0.5 text-xs text-[#808681]">
                            or click to browse · MP3, WAV, M4A, OGG, WebM (up to 25MB)
                          </span>
                        </button>

                        <div className="relative flex items-center justify-center">
                          <span className="h-px w-full bg-[#e0ded6]" />
                          <span className="absolute bg-[#fffaf0] px-3 font-mono text-[10px] uppercase text-[#737b77]">
                            or record live
                          </span>
                        </div>

                        {/* Live Microphone Recording */}
                        <AudioRecorder
                          onRecordingComplete={(recFile, dur) => {
                            analyzeFile(recFile, false, true);
                          }}
                        />
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) analyzeFile(file);
                        e.target.value = "";
                      }}
                      data-testid="input-audio-file"
                    />
                  </div>

                  {/* Sample Audio Presets */}
                  <div className="flex flex-col justify-between gap-4">
                    <div className="rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-2">
                        <Sparkles size={15} className="text-[#e85b48]" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#263b48]">
                          Quick Audio Presets
                        </h3>
                      </div>
                      <p className="mb-3 text-xs leading-5 text-[#777c79]">
                        Click any preset to synthesize a real audio file and test
                        Groq STT immediately:
                      </p>

                      <div className="space-y-2">
                        {AUDIO_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handlePresetSelect(preset)}
                            disabled={isPresetLoading}
                            className="group flex w-full items-start gap-2.5 rounded-xl border border-[#dcdad0] bg-[#f9f6ef] p-3 text-left transition hover:border-[#e85b48] hover:bg-[#fff5f2]"
                          >
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#263b48] text-[#fffaf0] group-hover:bg-[#e85b48]">
                              <Play size={10} className="ml-0.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[#263b48]">
                                  {preset.title}
                                </span>
                                <span className="font-mono text-[10px] text-[#737b77]">
                                  {preset.duration}s
                                </span>
                              </div>
                              <p className="line-clamp-1 mt-0.5 text-[11px] text-[#737b77]">
                                “{preset.spokenText}”
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#b7cbd0] bg-[#edf5f5] p-3.5 text-[#315b66]">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em]">
                        <Zap size={13} /> Groq LPU Pipeline
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-[#3e545a]">
                        Sends the complete audio stream with word-level
                        timestamps (<code className="font-mono">timestamp_granularities: ["word", "segment"]</code>).
                      </p>
                    </div>
                  </div>
                </section>

                {fileError && (
                  <div
                    className="flex items-start gap-2 rounded-xl border border-[#efc4bb] bg-[#fff0ec] px-4 py-3 text-xs text-[#9f4438]"
                    role="alert"
                    data-testid="status-file-error"
                  >
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}

                {transcribeError && (
                  <div
                    className="flex items-start justify-between gap-3 rounded-xl border border-[#efc4bb] bg-[#fff0ec] px-4 py-3 text-xs text-[#9f4438]"
                    role="alert"
                    data-testid="status-transcription-error"
                  >
                    <span className="flex items-start gap-2">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      {transcribeError}
                    </span>
                    <button
                      type="button"
                      onClick={handleRunTranscription}
                      className="shrink-0 font-bold underline"
                      data-testid="button-retry-transcription"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Submit Action Box */}
                <section
                  className={`rounded-2xl border p-5 transition-colors sm:p-6 ${
                    input
                      ? "border-[#b9d8cb] bg-[#e8f3ed]"
                      : "border-[#d5d4cb] bg-[#e9e4d8]"
                  }`}
                  id="request-step"
                >
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <Send
                          size={16}
                          className={input ? "text-[#368064]" : "text-[#8a908b]"}
                        />
                        <h2 className="text-sm font-bold text-[#263b48]">
                          Ready to run speech-to-text?
                        </h2>
                      </div>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-[#556b64]">
                        {input
                          ? `Ready: ${input.fileName} (${formatSeconds(
                              input.durationSeconds
                            )}) will be processed using ${selectedModel}.`
                          : "Upload an audio file, record your voice, or click a preset above."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleRunTranscription}
                      disabled={!input || isTranscribing}
                      className={`flex shrink-0 items-center justify-center gap-2.5 rounded-xl px-6 py-3 text-xs font-bold shadow-sm transition ${
                        input && !isTranscribing
                          ? "bg-[#e85b48] text-[#fffaf0] hover:bg-[#d84a37] shadow-[2px_2px_0_#263b48]"
                          : "cursor-not-allowed bg-[#c9c8be] text-[#777d7a]"
                      }`}
                      data-testid="button-run-transcription"
                    >
                      {isTranscribing ? (
                        <>
                          <LoaderCircle size={15} className="animate-spin" />
                          <span>Transcribing with Groq...</span>
                        </>
                      ) : (
                        <>
                          <Zap size={15} />
                          <span>
                            {pipelineMode === "groq"
                              ? "Execute Groq STT"
                              : "Run Demo Fixture"}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* Results Screen */}
            {hasResult && result && input && (
              <section
                id="results"
                className="animate-rise-in space-y-6"
                aria-labelledby="results-heading"
              >
                {/* Header and Run Another */}
                <div className="flex flex-col justify-between gap-4 border-b border-[#d9d9d2] pb-5 sm:flex-row sm:items-end">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#c5e1d5] text-[#28684f]">
                        <Check size={14} strokeWidth={3} />
                      </span>
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#4b8068]">
                        transcription complete
                      </span>
                    </div>
                    <h2
                      id="results-heading"
                      className="text-2xl font-bold tracking-tight text-[#263b48] sm:text-3xl"
                    >
                      Speech Aligned with Word Timestamps
                    </h2>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-[#6d7471]">
                      Model inference completed with high precision. Click any
                      word to jump audio playback directly to that millisecond.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={reset}
                    className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#c9cbc4] bg-[#fffaf0] px-4 py-2.5 text-xs font-bold text-[#263b48] shadow-sm transition hover:border-[#e85b48] hover:text-[#c94e40]"
                    data-testid="button-run-another"
                  >
                    <RotateCcw size={14} />
                    <span>Run Another File</span>
                  </button>
                </div>

                {/* Metrics Banner */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <ResultStat
                    label="Model"
                    value={result.model}
                    monoValue
                  />
                  <ResultStat
                    label="Latency"
                    value={
                      result.metrics?.inferenceLatencyMs
                        ? `${result.metrics.inferenceLatencyMs} ms`
                        : "Sub-second"
                    }
                    highlight
                  />
                  <ResultStat
                    label="Language"
                    value={`${result.detectedLanguage.toUpperCase()} · ${(
                      result.languageProbability * 100
                    ).toFixed(0)}%`}
                  />
                  <ResultStat
                    label="Audio Duration"
                    value={formatSeconds(result.audioDurationSeconds)}
                  />
                  <ResultStat
                    label="Total Words"
                    value={`${
                      result.metrics?.totalWords ||
                      result.segments.reduce(
                        (acc, s) => acc + (s.words?.length || 0),
                        0
                      ) ||
                      result.transcript.split(" ").length
                    } words`}
                  />
                </div>

                {/* Synchronized Audio Player Bar */}
                {input.objectUrl && (
                  <AudioPlaybackBar
                    audioUrl={input.objectUrl}
                    fileName={input.fileName}
                    duration={result.audioDurationSeconds}
                    seekToTime={seekTime}
                    onTimeUpdate={(time) => setCurrentPlaybackTime(time)}
                  />
                )}

                {/* Full Transcript Card with Search & Export */}
                <div
                  className="rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-5 shadow-sm"
                  data-testid="card-full-transcript"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e1d8] pb-3">
                    <div className="flex items-center gap-2">
                      <AudioLines size={16} className="text-[#e85b48]" />
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[#818681]">
                        Full Transcript
                      </span>
                    </div>

                    {/* Export Dropdown & Copy Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(result.transcript);
                          alert("Full transcript copied to clipboard!");
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[#c9c9be] bg-[#f9f6ef] px-3 py-1.5 text-xs font-bold text-[#263b48] hover:bg-[#e9e4d8]"
                      >
                        <Copy size={13} />
                        <span>Copy Text</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const srt = generateSRT(result.segments);
                          downloadTextFile(
                            srt,
                            `${input.fileName.replace(/\.[^/.]+$/, "")}.srt`,
                            "application/x-subrip;charset=utf-8"
                          );
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[#c9c9be] bg-[#f9f6ef] px-3 py-1.5 text-xs font-bold text-[#263b48] hover:bg-[#e9e4d8]"
                      >
                        <Download size={13} />
                        <span>SRT Subtitles</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const vtt = generateVTT(result.segments);
                          downloadTextFile(
                            vtt,
                            `${input.fileName.replace(/\.[^/.]+$/, "")}.vtt`,
                            "text/vtt;charset=utf-8"
                          );
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[#c9c9be] bg-[#f9f6ef] px-3 py-1.5 text-xs font-bold text-[#263b48] hover:bg-[#e9e4d8]"
                      >
                        <FileText size={13} />
                        <span>WebVTT</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          downloadJSONFile(
                            result,
                            `${input.fileName.replace(/\.[^/.]+$/, "")}-groq.json`
                          );
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[#c9c9be] bg-[#f9f6ef] px-3 py-1.5 text-xs font-bold text-[#263b48] hover:bg-[#e9e4d8]"
                      >
                        <Braces size={13} />
                        <span>JSON</span>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Word Highlighting in Transcript */}
                  <div
                    className="max-h-60 overflow-y-auto rounded-xl bg-[#f9f6ef] p-4 text-base leading-8 text-[#334b52]"
                    data-testid="text-full-transcript"
                  >
                    {result.segments.map((seg) => (
                      <span
                        key={seg.id}
                        className={`mr-1.5 inline cursor-pointer rounded px-1 transition-colors ${
                          activeSegment?.id === seg.id
                            ? "bg-[#e85b48]/20 font-bold text-[#263b48]"
                            : "hover:bg-[#e9e4d8]"
                        }`}
                        onClick={() => setSeekTime(seg.start)}
                        title={`Click to play from ${formatSeconds(seg.start)}`}
                      >
                        {seg.text}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Timeline and Segment Explorer */}
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]">
                  <div className="rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e1d8] px-4 py-3.5 sm:px-5">
                      <div className="flex items-center gap-2">
                        <FileCode2 size={17} className="text-[#e85b48]" />
                        <h3 className="text-sm font-bold text-[#263b48]">
                          Segment-by-Segment Timestamps
                        </h3>
                      </div>

                      {/* Search in segments */}
                      <div className="relative flex items-center">
                        <Search
                          size={13}
                          className="absolute left-2.5 text-[#737b77]"
                        />
                        <input
                          type="text"
                          placeholder="Filter segments..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="rounded-lg border border-[#c9c9be] bg-[#f9f6ef] py-1 pl-7 pr-3 text-xs text-[#263b48] outline-none focus:border-[#e85b48]"
                        />
                      </div>
                    </div>

                    <div className="divide-y divide-[#e5e2d9]">
                      {filteredSegments.length > 0 ? (
                        filteredSegments.map((segment) => (
                          <SegmentRow
                            key={segment.id}
                            segment={segment}
                            open={openSegment === segment.id}
                            isActive={activeSegment?.id === segment.id}
                            onToggle={() =>
                              setOpenSegment(
                                openSegment === segment.id ? null : segment.id
                              )
                            }
                            onWordClick={(t) => setSeekTime(t)}
                          />
                        ))
                      ) : (
                        <div className="p-6 text-center text-xs text-[#737b77]">
                          No segments matching "{searchQuery}"
                        </div>
                      )}
                    </div>

                    <div className="border-t border-[#e3e1d8] bg-[#faf6ed] px-4 py-3 sm:px-5">
                      <p className="text-xs leading-5 text-[#777c79]">
                        <strong className="text-[#263b48]">
                          Word-level accuracy:
                        </strong>{" "}
                        Expand any segment row to see exact start and end times
                        along with model confidence scores. Click "Play" next to
                        any word to jump the audio timeline directly to that
                        timestamp.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border border-[#eadf95] bg-[#fffbe3] p-3.5 text-[#72661d]">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em]">
                        <Sparkles size={13} /> Pipeline Output Analysis
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[#3e545a]">
                        <strong className="font-bold text-[#263b48]">
                          Groq LPU Inference:
                        </strong>{" "}
                        Whisper processed {result.audioDurationSeconds.toFixed(1)}s
                        of speech in{" "}
                        {result.metrics?.inferenceLatencyMs || 250}ms. Sub-second
                        turnaround enables real-time voice applications.
                      </p>
                    </div>

                    <CodePanel
                      input={input}
                      result={result}
                      requestParams={{
                        model: selectedModel,
                        language: language || "auto",
                        prompt: promptContext,
                        temperature,
                      }}
                    />
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Groq API Key Configuration Modal */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        serverKeyMasked={groqConfig?.maskedKey || null}
        hasServerKey={Boolean(groqConfig?.hasGroqKey)}
        customKey={customKey}
        onSaveCustomKey={handleSaveCustomKey}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <DemoApp />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

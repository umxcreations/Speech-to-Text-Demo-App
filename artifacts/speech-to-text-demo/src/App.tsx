import { useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  AudioLines,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  FileAudio,
  FileCode2,
  Info,
  Languages,
  LoaderCircle,
  MousePointer2,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import { useHealthCheck } from '@workspace/api-client-react';
import * as ApiClient from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();

type DemoStep = 'ready' | 'inspect' | 'request' | 'result';

interface TranscriptionInput {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  language?: string | null;
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  probability: number;
}

interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: WordTimestamp[];
}

interface TranscriptionResult {
  jobId: string;
  status: string;
  model: string;
  detectedLanguage: string;
  languageProbability: number;
  audioDurationSeconds: number;
  transcript: string;
  segments: TranscriptSegment[];
}

const useCreateDemoTranscription = (
  ApiClient as unknown as {
    useCreateDemoTranscription: () => {
      data?: TranscriptionResult;
      isPending: boolean;
      isError: boolean;
      mutate: (variables: { data: TranscriptionInput }) => void;
      reset: () => void;
    };
  }
).useCreateDemoTranscription;

const demoInput: TranscriptionInput = {
  fileName: 'team-sync-standup.mp3',
  mimeType: 'audio/mpeg',
  fileSizeBytes: 2457600,
  durationSeconds: 86.4,
  language: 'en',
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(1).padStart(4, '0')}`;
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
  state: 'complete' | 'current' | 'upcoming';
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`group flex w-full items-start gap-3 text-left ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      onClick={onClick}
      data-testid={`step-${number.toLowerCase()}${onClick ? '-button' : ''}`}
    >
      <span
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold transition-colors ${
          state === 'complete'
            ? 'border-[#263b48] bg-[#263b48] text-[#f7f3e9]'
            : state === 'current'
              ? 'border-[#e85b48] bg-[#e85b48] text-[#fffaf0]'
              : 'border-[#c7c9c7] bg-[#f7f3e9] text-[#767b80] group-hover:border-[#e85b48]'
        }`}
      >
        {state === 'complete' ? <Check size={15} strokeWidth={3} /> : number}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className={`block text-sm font-bold ${state === 'upcoming' ? 'text-[#767b80]' : 'text-[#263b48]'}`}>{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[#767b80]">{description}</span>
      </span>
    </Tag>
  );
}

function Header({ onReset }: { onReset: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-[#d9d9d2] px-5 py-4 lg:px-10">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#e85b48] text-[#fffaf0] shadow-[3px_3px_0_#263b48]">
          <AudioLines size={19} strokeWidth={2.4} />
        </div>
        <div>
          <div className="font-mono text-[13px] font-bold tracking-[-0.03em] text-[#263b48]">signal<span className="text-[#e85b48]">/</span>lab</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a8c88]">Speech-to-text lab</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-2 rounded-full border border-[#d9d9d2] bg-[#f7f3e9] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#5f676b] sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4b9a78]" />
          Demo mode
        </span>
        <button
          type="button"
          onClick={onReset}
          className="group flex items-center gap-2 rounded-full border border-transparent px-3 py-2 text-xs font-bold text-[#6b716f] transition-colors hover:border-[#d9d9d2] hover:bg-[#f7f3e9] hover:text-[#263b48]"
          data-testid="button-reset-demo"
        >
          <RotateCcw size={14} className="transition-transform group-hover:-rotate-45" />
          Reset
        </button>
      </div>
    </header>
  );
}

function Readiness({ status, isLoading, isError, onRetry }: { status?: string; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#d9d9d2] bg-[#e8f0ed] px-5 py-3.5 lg:px-10" data-testid="status-service-readiness">
      <div className="flex items-center gap-3">
        <span className={`relative flex h-7 w-7 items-center justify-center rounded-full ${isError ? 'bg-[#f4d7cf] text-[#b74839]' : 'bg-[#c5e1d5] text-[#28684f]'}`}>
          {isLoading ? <LoaderCircle size={15} className="animate-spin" /> : isError ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
          {!isLoading && !isError && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-[#e8f0ed] bg-[#4b9a78]" />}
        </span>
        <div>
          <p className="text-xs font-bold text-[#263b48]">{isLoading ? 'Checking transcription service…' : isError ? 'Service check needs a retry' : 'Transcription service ready'}</p>
          <p className="text-[11px] text-[#5c716d]">{isError ? 'The API did not answer. Your audio stays in the browser.' : 'The demo endpoint is online and ready to accept analyzed metadata.'}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="mono text-[10px] text-[#61817a]">{status ? `healthz · ${status}` : 'healthz · checking'}</span>
        {isError && (
          <button type="button" onClick={onRetry} className="flex items-center gap-1 rounded-md bg-[#263b48] px-2.5 py-1.5 text-[11px] font-bold text-[#fffaf0]" data-testid="button-retry-health">
            <RefreshCw size={12} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}

function FileDropzone({
  input,
  isDemo,
  isInspecting,
  onFile,
  onDemo,
  onClear,
}: {
  input: TranscriptionInput | null;
  isDemo: boolean;
  isInspecting: boolean;
  onFile: (file: File) => void;
  onDemo: () => void;
  onClear: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-4 shadow-[0_8px_24px_rgba(38,59,72,.05)] sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fbe2dc] text-[#cf5141]"><UploadCloud size={15} /></div>
            <h3 className="text-sm font-bold text-[#263b48]">Select an audio source</h3>
          </div>
          <p className="max-w-lg text-xs leading-5 text-[#777c79]">We only send metadata to the demo API. The actual audio file never leaves this browser.</p>
        </div>
        {input && (
          <button type="button" onClick={onClear} className="rounded-md p-1.5 text-[#929793] hover:bg-[#f0ece2] hover:text-[#263b48]" aria-label="Clear selected audio" data-testid="button-clear-audio">
            <X size={16} />
          </button>
        )}
      </div>
      {input ? (
        <div className="animate-rise-in rounded-xl border border-[#b9d8cb] bg-[#edf6f1] p-4" data-testid="card-audio-inspection">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#263b48] text-[#d8eddf]"><FileAudio size={22} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-bold text-[#263b48]" data-testid="text-audio-filename">{input.fileName}</p>
                {isDemo && <span className="rounded-full bg-[#f3d95f] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-[#263b48]">demo fixture</span>}
              </div>
              <p className="mono mt-1 text-[10px] text-[#668079]">{input.mimeType} · {formatBytes(input.fileSizeBytes)}</p>
            </div>
            {isInspecting ? <LoaderCircle size={17} className="animate-spin text-[#e85b48]" /> : <CheckCircle2 size={18} className="text-[#4b9a78]" />}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#cee3d8] pt-3">
            <MetadataCell icon={<Clock3 size={13} />} label="duration" value={formatSeconds(input.durationSeconds)} testId="text-audio-duration" />
            <MetadataCell icon={<Languages size={13} />} label="language" value={input.language || 'auto'} testId="text-audio-language" />
            <MetadataCell icon={<Braces size={13} />} label="payload" value="metadata" testId="text-audio-payload" />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) onFile(file);
          }}
          className="group relative flex min-h-[156px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#a9bdb6] bg-[#f2f7f3] px-4 text-center transition-all hover:border-[#e85b48] hover:bg-[#fff4ed]"
          data-testid="button-select-audio"
        >
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#fffaf0] text-[#e85b48] shadow-sm transition-transform group-hover:-translate-y-1"><FileAudio size={21} /></div>
          <span className="text-sm font-bold text-[#263b48]">Drop an audio file here</span>
          <span className="mt-1 text-xs text-[#808681]">or click to browse · MP3, WAV, M4A</span>
          <span className="mt-3 rounded-full border border-[#d8e4df] bg-[#fffaf0] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#638078]">browser metadata only</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
        data-testid="input-audio-file"
      />
      {!input && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-[#818580]"><Info size={13} /> We analyze duration locally</span>
          <button type="button" onClick={onDemo} className="flex items-center gap-1.5 text-xs font-bold text-[#d45343] underline decoration-[#efaa9f] underline-offset-4 hover:text-[#263b48]" data-testid="button-try-demo-audio">
            <Sparkles size={13} /> Try demo audio
          </button>
        </div>
      )}
    </div>
  );
}

function MetadataCell({ icon, label, value, testId }: { icon: ReactNode; label: string; value: string; testId: string }) {
  return (
    <div>
      <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#799188]">{icon}{label}</p>
      <p className="mt-1 text-xs font-bold text-[#263b48]" data-testid={testId}>{value}</p>
    </div>
  );
}

function PipelineNote({ tone, icon, title, plain, technical }: { tone: 'coral' | 'navy' | 'yellow'; icon: ReactNode; title: string; plain: string; technical: string }) {
  const styles = {
    coral: 'border-[#f0beb4] bg-[#fff2ed] text-[#b94a3d]',
    navy: 'border-[#b7cbd0] bg-[#edf5f5] text-[#315b66]',
    yellow: 'border-[#eadf95] bg-[#fffbe3] text-[#72661d]',
  };
  return (
    <div className={`rounded-xl border p-3.5 ${styles[tone]}`} data-testid={`note-${title.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em]">{icon}{title}</div>
      <p className="mt-2 text-xs leading-5 text-[#3e545a]"><strong className="font-bold text-[#263b48]">Plain language:</strong> {plain}</p>
      <p className="mono mt-2 border-t border-current/15 pt-2 text-[10px] leading-4 opacity-80"><strong>Technical:</strong> {technical}</p>
    </div>
  );
}

function CodePanel({ input, result }: { input: TranscriptionInput; result?: TranscriptionResult }) {
  const [copied, setCopied] = useState(false);
  const payload = JSON.stringify(result ? { input, output: { jobId: result.jobId, status: result.status, segments: result.segments.length } } : { fileName: input.fileName, mimeType: input.mimeType, durationSeconds: input.durationSeconds, language: input.language }, null, 2);
  return (
    <div className="overflow-hidden rounded-2xl border border-[#304957] bg-[#263b48] shadow-[0_12px_30px_rgba(38,59,72,.14)]" data-testid="panel-technical-payload">
      <div className="flex items-center justify-between border-b border-[#49616a] px-4 py-3">
        <div className="flex items-center gap-2 text-[#d7e6df]"><Terminal size={14} /><span className="mono text-[10px] uppercase tracking-[0.12em]">request / response</span></div>
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
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto p-4 font-mono text-[10px] leading-5 text-[#cfe1d9]" data-testid="text-technical-payload"><code>{payload}</code></pre>
    </div>
  );
}

function ResultView({ result, input, onReset }: { result: TranscriptionResult; input: TranscriptionInput; onReset: () => void }) {
  const [openSegment, setOpenSegment] = useState<number | null>(0);
  return (
    <section className="animate-rise-in space-y-5" aria-labelledby="results-heading">
      <div className="flex flex-col justify-between gap-4 border-b border-[#d9d9d2] pb-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#c5e1d5] text-[#28684f]"><Check size={14} strokeWidth={3} /></span><span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#4b8068]">pipeline complete</span></div>
          <h2 id="results-heading" className="text-2xl font-bold tracking-[-0.04em] text-[#263b48] sm:text-3xl">Your transcript, with its timing intact.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d7471]">The response below is deterministic for this demo, so every timestamp and confidence score can be inspected without waiting on a live model.</p>
        </div>
        <button type="button" onClick={onReset} className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#c9cbc4] bg-[#fffaf0] px-3.5 py-2.5 text-xs font-bold text-[#263b48] transition hover:border-[#e85b48] hover:text-[#c94e40]" data-testid="button-run-another">
          <RotateCcw size={14} /> Run another
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <ResultStat label="job id" value={result.jobId} monoValue />
        <ResultStat label="model" value={result.model} />
        <ResultStat label="language" value={`${result.detectedLanguage} · ${(result.languageProbability * 100).toFixed(1)}%`} />
        <ResultStat label="audio duration" value={formatSeconds(result.audioDurationSeconds)} />
      </div>
      <div className="rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] px-5 py-4 shadow-[0_8px_24px_rgba(38,59,72,.04)]" data-testid="card-full-transcript">
        <div className="mb-2 flex items-center gap-2"><AudioLines size={15} className="text-[#e85b48]" /><span className="mono text-[10px] font-bold uppercase tracking-[.12em] text-[#818681]">full transcript</span></div>
        <p className="text-base leading-7 tracking-[-0.01em] text-[#334b52]" data-testid="text-full-transcript">“{result.transcript}”</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]">
        <div className="rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] shadow-[0_8px_24px_rgba(38,59,72,.05)]">
          <div className="flex items-center justify-between border-b border-[#e3e1d8] px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2"><FileCode2 size={17} className="text-[#e85b48]" /><h3 className="text-sm font-bold text-[#263b48]">Timestamped transcript</h3></div>
            <span className="mono text-[10px] text-[#808681]">{result.segments.length} segments</span>
          </div>
          <div className="divide-y divide-[#e5e2d9]">
            {result.segments.map((segment) => <SegmentRow key={segment.id} segment={segment} open={openSegment === segment.id} onToggle={() => setOpenSegment(openSegment === segment.id ? null : segment.id)} />)}
          </div>
          <div className="border-t border-[#e3e1d8] bg-[#faf6ed] px-4 py-3 sm:px-5"><p className="text-xs leading-5 text-[#777c79]"><strong className="text-[#263b48]">How to read this:</strong> expand a segment to inspect word-level timing and model confidence. This is the same shape a product can use to highlight, seek, or annotate spoken content.</p></div>
        </div>
        <div className="space-y-4">
          <PipelineNote tone="yellow" icon={<Sparkles size={14} />} title="What happened" plain="The system found the spoken words, grouped them into two readable chunks, and kept the moment each word appeared." technical="POST /api/transcribe/demo → TranscriptionResult with segments[].words[]" />
          <CodePanel input={input} result={result} />
        </div>
      </div>
    </section>
  );
}

function ResultStat({ label, value, monoValue = false }: { label: string; value: string; monoValue?: boolean }) {
  return <div className="rounded-xl border border-[#d5d4cb] bg-[#f5f1e8] px-3.5 py-3" data-testid={`stat-${label.replaceAll(' ', '-')}`}><p className="mono text-[9px] uppercase tracking-[0.12em] text-[#818681]">{label}</p><p className={`mt-1 truncate text-sm font-bold text-[#263b48] ${monoValue ? 'mono text-[11px]' : ''}`}>{value}</p></div>;
}

function SegmentRow({ segment, open, onToggle }: { segment: TranscriptSegment; open: boolean; onToggle: () => void }) {
  return (
    <div className="group">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[#faf6ed] sm:px-5" data-testid={`button-segment-${segment.id}`}>
        <span className="mono mt-0.5 w-12 shrink-0 text-[10px] font-bold text-[#e85b48]">{formatSeconds(segment.start)}</span>
        <span className="flex-1 text-sm leading-6 text-[#3e4c51]">{segment.text}</span>
        <ChevronDown size={16} className={`mt-1 shrink-0 text-[#89918e] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="animate-rise-in bg-[#f5f8f3] px-4 pb-4 pt-1 sm:px-5">
          <div className="ml-[60px] overflow-x-auto rounded-lg border border-[#d4e0d8] bg-[#fffaf0]">
            <div className="grid min-w-[520px] grid-cols-[1.2fr_1fr_1fr_.8fr] border-b border-[#e3e1d8] px-3 py-2 font-mono text-[9px] uppercase tracking-[.1em] text-[#82918a]"><span>word</span><span>start</span><span>end</span><span>confidence</span></div>
            {segment.words.map((word, index) => <WordRow key={`${segment.id}-${index}`} word={word} index={index} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function WordRow({ word, index }: { word: WordTimestamp; index: number }) {
  return <div className={`grid min-w-[520px] grid-cols-[1.2fr_1fr_1fr_.8fr] px-3 py-2.5 text-xs ${index % 2 ? 'bg-[#fbf8f0]' : ''}`} data-testid={`row-word-${index}`}><span className="font-bold text-[#324b51]">{word.word}</span><span className="mono text-[10px] text-[#77847f]">{formatSeconds(word.start)}</span><span className="mono text-[10px] text-[#77847f]">{formatSeconds(word.end)}</span><span className="mono text-[10px] text-[#4b8068]">{(word.probability * 100).toFixed(0)}%</span></div>;
}

function DemoFlow() {
  const health = useHealthCheck();
  const createDemo = useCreateDemoTranscription();
  const [input, setInput] = useState<TranscriptionInput | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [language, setLanguage] = useState('en');
  const [activeStep, setActiveStep] = useState<DemoStep>('ready');
  const [fileError, setFileError] = useState('');

  const result = createDemo.data;
  const hasResult = Boolean(result);
  const currentStep: DemoStep = hasResult ? 'result' : createDemo.isPending ? 'request' : input ? 'inspect' : activeStep;

  const reset = () => {
    setInput(null);
    setIsDemo(false);
    setIsInspecting(false);
    setFileError('');
    setActiveStep('ready');
    createDemo.reset();
  };

  const useDemoAudio = () => {
    setInput({ ...demoInput, language });
    setIsDemo(true);
    setFileError('');
    setActiveStep('inspect');
  };

  const analyzeFile = (file: File) => {
    if (!file.type.startsWith('audio/')) {
      setFileError('That file does not look like audio. Choose an MP3, WAV, or M4A file.');
      return;
    }
    setFileError('');
    setIsDemo(false);
    setIsInspecting(true);
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setInput({ fileName: file.name, mimeType: file.type || 'audio/*', fileSizeBytes: file.size, durationSeconds: duration, language });
      setIsInspecting(false);
      setActiveStep('inspect');
      URL.revokeObjectURL(objectUrl);
    };
    audio.onerror = () => {
      setFileError('We could not read duration from that file. Try the demo fixture or another audio file.');
      setIsInspecting(false);
      URL.revokeObjectURL(objectUrl);
    };
    audio.src = objectUrl;
  };

  const runTranscription = () => {
    if (!input || createDemo.isPending) return;
    setActiveStep('request');
    createDemo.mutate({ data: { ...input, language: language || null } });
  };

  const jumpTo = (step: DemoStep) => {
    if (step === 'ready') {
      document.getElementById('service-ready')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (step === 'inspect' && input) {
      document.getElementById('audio-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (step === 'result' && result) {
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f3f0e7] text-[#263b48]">
      <div className="noise-overlay" />
      <Header onReset={reset} />
      <Readiness status={health.data?.status} isLoading={health.isLoading} isError={health.isError} onRetry={() => void health.refetch()} />
      <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-8 lg:px-10 lg:pt-12">
        <div className="grid gap-10 lg:grid-cols-[205px_minmax(0,1fr)] xl:gap-16">
          <aside className="lg:sticky lg:top-8 lg:h-fit">
            <div className="mb-5 flex items-center gap-2 text-[#e85b48]"><Activity size={15} /><span className="mono text-[10px] font-bold uppercase tracking-[0.18em]">guided flow</span></div>
            <nav className="space-y-5" aria-label="Demo steps">
              <StepMarker number="01" label="Service ready" description="Confirm the endpoint" state={currentStep === 'ready' ? 'current' : 'complete'} onClick={() => jumpTo('ready')} />
              <StepMarker number="02" label="Inspect audio" description="Read safe metadata" state={input ? 'complete' : currentStep === 'inspect' ? 'current' : 'upcoming'} onClick={() => jumpTo('inspect')} />
              <StepMarker number="03" label="Send request" description="Submit the contract" state={hasResult ? 'complete' : currentStep === 'request' ? 'current' : 'upcoming'} onClick={input ? runTranscription : undefined} />
              <StepMarker number="04" label="Read response" description="Explore timestamps" state={hasResult ? 'complete' : 'upcoming'} onClick={() => jumpTo('result')} />
            </nav>
            <div className="mt-8 hidden rounded-xl border border-[#d7d6ce] bg-[#fffaf0] p-3.5 lg:block">
              <div className="mb-2 flex items-center gap-2 text-[#263b48]"><Code2 size={14} /><span className="text-xs font-bold">One contract, four moments</span></div>
              <p className="text-[11px] leading-5 text-[#777c79]">This walkthrough makes the invisible hand-offs visible: browser → request → model → transcript.</p>
            </div>
          </aside>
          <div className="min-w-0">
            <section id="service-ready" className="animate-rise-in mb-10">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#263b48] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-[#f7f3e9]">deterministic demo</span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7b827f]"><MousePointer2 size={12} /> built for showing, not guessing</span>
              </div>
              <h1 className="max-w-4xl text-[clamp(2.7rem,6vw,5.75rem)] font-bold leading-[.94] tracking-[-0.065em] text-[#263b48]">See the signal<br /><span className="text-[#e85b48]">between words.</span></h1>
              <div className="mt-6 flex max-w-3xl flex-col gap-3 border-l-2 border-[#e85b48] pl-4 sm:flex-row sm:items-start sm:gap-7 sm:pl-5">
                <p className="text-base leading-7 text-[#4e5b60] sm:max-w-md">A guided speech-to-text demo for explaining what really happens after someone presses upload.</p>
                <p className="mono max-w-md text-[11px] leading-5 text-[#7b827f]"><span className="font-bold text-[#263b48]">Plain language:</span> choose a recording, watch it move through the pipeline, then inspect every timestamp.<br /><span className="font-bold text-[#263b48]">Technical:</span> browser metadata → typed POST → segment and word alignment.</p>
              </div>
            </section>

            {!hasResult && (
              <div className="space-y-5">
                <section id="audio-input" className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
                  <FileDropzone input={input} isDemo={isDemo} isInspecting={isInspecting} onFile={analyzeFile} onDemo={useDemoAudio} onClear={() => { setInput(null); setIsDemo(false); }} />
                  <div className="flex flex-col justify-between gap-4">
                    <PipelineNote tone="coral" icon={<Zap size={14} />} title="Step 01 / inspect" plain="Before any transcription can start, the browser checks what this recording is and how long it lasts." technical="File → HTMLMediaElement.duration + {fileName, mimeType, fileSizeBytes}" />
                    <div className="rounded-2xl border border-[#d5d4cb] bg-[#e9e4d8] p-4">
                      <div className="mb-2 flex items-center gap-2"><FileCode2 size={15} className="text-[#50656b]" /><span className="mono text-[10px] font-bold uppercase tracking-[.12em] text-[#5c6d6d]">language hint</span></div>
                      <div className="flex items-center gap-3">
                        <select value={language} onChange={(event) => { setLanguage(event.target.value); if (input) setInput({ ...input, language: event.target.value }); }} className="w-full rounded-lg border border-[#c9c9be] bg-[#fffaf0] px-3 py-2.5 text-sm font-bold text-[#263b48] outline-none focus:border-[#e85b48] focus:ring-2 focus:ring-[#e85b48]/20" aria-label="Audio language hint" data-testid="select-language">
                          <option value="en">English (en)</option>
                          <option value="es">Spanish (es)</option>
                          <option value="fr">French (fr)</option>
                          <option value="">Auto-detect</option>
                        </select>
                        <Languages size={17} className="shrink-0 text-[#70827d]" />
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-[#737b77]">Optional context for the model. Leave it on auto-detect when the speaker’s language is unknown.</p>
                    </div>
                  </div>
                </section>
                {fileError && <div className="flex items-start gap-2 rounded-xl border border-[#efc4bb] bg-[#fff0ec] px-4 py-3 text-xs text-[#9f4438]" role="alert" data-testid="status-file-error"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{fileError}</span></div>}
                {createDemo.isError && <div className="flex items-start justify-between gap-3 rounded-xl border border-[#efc4bb] bg-[#fff0ec] px-4 py-3 text-xs text-[#9f4438]" role="alert" data-testid="status-transcription-error"><span className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />The demo request did not complete. Try it again; your inspected audio is still here.</span><button type="button" onClick={runTranscription} className="shrink-0 font-bold underline" data-testid="button-retry-transcription">Retry</button></div>}
                <section className={`rounded-2xl border p-5 transition-colors sm:p-6 ${input ? 'border-[#b9d8cb] bg-[#e8f3ed]' : 'border-[#d5d4cb] bg-[#e9e4d8]'}`} id="request-step">
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2"><Send size={16} className={input ? 'text-[#368064]' : 'text-[#8a908b]'} /><h2 className="text-sm font-bold text-[#263b48]">Ready to make the request?</h2></div>
                      <p className="mt-1.5 max-w-xl text-xs leading-5 text-[#6d7873]">{input ? 'Your metadata is inspected. The next click sends the exact typed payload shown below.' : 'Choose a file or load the demo fixture to unlock the request.'}</p>
                    </div>
                    <button type="button" disabled={!input || createDemo.isPending} onClick={runTranscription} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#e85b48] px-5 py-3 text-sm font-bold text-[#fffaf0] shadow-[3px_3px_0_#263b48] transition-all hover:-translate-y-0.5 hover:bg-[#d95142] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#b9b9b0] disabled:shadow-none" data-testid="button-run-transcription">
                      {createDemo.isPending ? <><LoaderCircle size={16} className="animate-spin" /> Processing…</> : <><Play size={15} fill="currentColor" /> Run demo transcription</>}
                    </button>
                  </div>
                </section>
                {createDemo.isPending && (
                  <div className="animate-rise-in overflow-hidden rounded-2xl border border-[#b7cbd0] bg-[#edf5f5]" data-testid="status-transcription-loading">
                    <div className="relative h-1 overflow-hidden bg-[#d4e5e3]"><div className="absolute inset-y-0 w-1/3 bg-[#e85b48] animate-scan" /></div>
                    <div className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#263b48] text-[#f3d95f]"><AudioLines size={21} className="animate-breathe" /></div><div><p className="text-sm font-bold text-[#263b48]">The model is aligning the signal…</p><p className="mt-1 text-xs text-[#678078]">Plain language: listening, finding pauses, and placing each word on the timeline.</p><p className="mono mt-2 text-[10px] text-[#788b86]">POST /api/transcribe/demo · deterministic response</p></div></div>
                  </div>
                )}
                {input && !createDemo.isPending && <CodePanel input={input} />}
              </div>
            )}
            {result && input && <div id="results"><ResultView result={result} input={input} onReset={reset} /></div>}
            {!input && !hasResult && (
              <div className="mt-14 hidden items-center gap-3 text-[#8b908b] sm:flex"><ArrowDown size={15} /><span className="mono text-[10px] uppercase tracking-[.14em]">start with a recording above</span><span className="h-px flex-1 bg-[#d5d4cb]" /></div>
            )}
          </div>
        </div>
      </main>
      <footer className="border-t border-[#d9d9d2] bg-[#ece8dd] px-5 py-5 lg:px-10">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <p className="flex items-center gap-2 text-xs text-[#6f7874]"><Sparkles size={13} className="text-[#e85b48]" /> A presentation-ready contract you can explain out loud.</p>
          <p className="mono text-[10px] uppercase tracking-[.12em] text-[#89908b]">signal/lab · v0.1 · demo only</p>
        </div>
      </footer>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={DemoFlow} />
        <Route path="/not-found" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
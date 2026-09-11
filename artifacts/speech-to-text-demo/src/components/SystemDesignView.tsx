/**
 * SystemDesignView.tsx
 *
 * Part 2: Enterprise System Design & Architecture Console
 *
 * WHAT THIS COMPONENT DOES:
 * 1. Provides an interactive, live demonstration and architectural breakdown of the 4 key system design pillars:
 *    - Concurrent Uploads Handling (Presigned URLs, 202 Accepted Async Task Queue, Worker Autoscaling).
 *    - Audio & Transcript Storage Architecture (S3 Object Storage + PostgreSQL JSONB Schema & GIN Indexing).
 *    - Resilience, Exponential Backoff Retries & Dead Letter Queue (DLQ) Recovery.
 *    - REST / OpenAPI Interface Specification with live curl examples.
 * 2. Features live execution sandboxes that call real backend endpoints (POST /api/v1/transcriptions,
 *    GET /api/v1/transcriptions/:jobId, and POST /api/v1/transcriptions/:jobId/retry).
 *
 * WHY THIS IS NEEDED:
 * - Bridges theoretical system architecture with an end-to-end working production implementation.
 * - Allows technical reviewers to test queue decoupling, retries, and schema integrity directly in the UI.
 */

import { useState, useEffect } from "react";
import {
  Server,
  Database,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Check,
  Send,
  Layers,
  Cpu,
  ArrowRight,
  ShieldAlert,
  Play,
  Terminal,
} from "lucide-react";
import {
  submitAsyncTranscription,
  pollTranscriptionJob,
  retryDlqJob,
  fetchSystemDesignSchema,
  type AsyncJobRecord,
} from "../lib/groq-api";
import { AUDIO_PRESETS, generatePresetAudioFile } from "../lib/audio-presets";

export function SystemDesignView() {
  const [activeTab, setActiveTab] = useState<
    "concurrency" | "storage" | "resilience" | "api"
  >("concurrency");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Schema state
  const [schemaData, setSchemaData] = useState<any>(null);

  // Concurrency sandbox state
  const [isSubmittingAsync, setIsSubmittingAsync] = useState(false);
  const [asyncJob, setAsyncJob] = useState<AsyncJobRecord | null>(null);
  const [asyncLog, setAsyncLog] = useState<string[]>([]);

  // Resilience / DLQ sandbox state
  const [isSimulatingDlq, setIsSimulatingDlq] = useState(false);
  const [dlqJob, setDlqJob] = useState<AsyncJobRecord | null>(null);
  const [dlqLogs, setDlqLogs] = useState<string[]>([]);
  const [isRetryingDlq, setIsRetryingDlq] = useState(false);

  useEffect(() => {
    fetchSystemDesignSchema()
      .then((data) => setSchemaData(data))
      .catch((err) => console.error("Failed to load system design schema:", err));
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(key);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  /**
   * Dispatches a live asynchronous job to POST /api/v1/transcriptions and polls status.
   * WHAT: Simulates presigned URL upload and async worker queue processing with 202 Accepted.
   * WHY: Proves non-blocking request handling and client decoupling under production load.
   */
  const handleRunAsyncDispatch = async () => {
    setIsSubmittingAsync(true);
    setAsyncJob(null);
    setAsyncLog(["[Client] Generating sample audio buffer...", "[Client] Disagreeing synchronous upload..."]);

    try {
      const sampleFile = await generatePresetAudioFile(AUDIO_PRESETS[0]);
      setAsyncLog((prev) => [
        ...prev,
        `[Client] Submitting to POST /api/v1/transcriptions (${sampleFile.name}, ${sampleFile.size} bytes)...`,
      ]);

      const accepted = await submitAsyncTranscription({
        file: sampleFile,
        fileName: sampleFile.name,
        model: "whisper-large-v3-turbo",
      });

      setAsyncLog((prev) => [
        ...prev,
        `[Gateway] HTTP 202 Accepted returned immediately.`,
        `[Gateway] Assigned Job ID: ${accepted.job_id}`,
        `[Gateway] S3 Path: ${accepted.s3_object_path}`,
        `[Worker] Background queue consumer started polling...`,
      ]);

      // Poll until completed
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const statusRecord = await pollTranscriptionJob(accepted.job_id);
          setAsyncJob(statusRecord);

          setAsyncLog((prev) => [
            ...prev,
            `[Poll #${attempts}] Status: '${statusRecord.status}' (Attempts: ${statusRecord.attempt_count}/${statusRecord.max_retries})`,
          ]);

          if (
            statusRecord.status === "completed" ||
            statusRecord.status === "failed" ||
            statusRecord.status === "dead_letter_queue"
          ) {
            clearInterval(pollInterval);
            setIsSubmittingAsync(false);
            if (statusRecord.status === "completed") {
              setAsyncLog((prev) => [
                ...prev,
                `[Completed] Transcript ready (${statusRecord.result?.segments?.length || 0} segments).`,
              ]);
            }
          }
        } catch (err: any) {
          clearInterval(pollInterval);
          setIsSubmittingAsync(false);
          setAsyncLog((prev) => [...prev, `[Poll Error] ${err.message}`]);
        }
      }, 1000);
    } catch (err: any) {
      setIsSubmittingAsync(false);
      setAsyncLog((prev) => [...prev, `[Submission Error] ${err.message}`]);
    }
  };

  /**
   * Simulates transient worker failure and Dead Letter Queue (DLQ) routing.
   * WHAT: Enqueues a job with 'simulateFailure: true', records 3 exponential backoff retries,
   *       and verifies transition into 'dead_letter_queue'.
   * WHY: Demonstrates automated error recovery and poison pill isolation.
   */
  const handleSimulateDlq = async () => {
    setIsSimulatingDlq(true);
    setDlqJob(null);
    setDlqLogs([
      "[Test Engine] Generating audio payload...",
      "[Test Engine] Dispatching job with simulated GPU memory/rate-limit fault...",
    ]);

    try {
      const sampleFile = await generatePresetAudioFile(AUDIO_PRESETS[1]);
      const accepted = await submitAsyncTranscription({
        file: sampleFile,
        fileName: sampleFile.name,
        model: "whisper-large-v3",
        simulateFailure: true,
      });

      setDlqLogs((prev) => [
        ...prev,
        `[Gateway] Job ${accepted.job_id} queued in worker queue.`,
        `[Worker] Attempt 1 executing...`,
      ]);

      let polls = 0;
      const interval = setInterval(async () => {
        polls++;
        try {
          const rec = await pollTranscriptionJob(accepted.job_id);
          setDlqJob(rec);

          if (rec.retry_history && rec.retry_history.length > 0) {
            const latest = rec.retry_history[rec.retry_history.length - 1];
            setDlqLogs((prev) => [
              ...prev,
              `[Worker Retry] Attempt ${latest.attempt} failed: "${latest.error}". Backing off ${latest.nextDelayMs}ms...`,
            ]);
          }

          if (rec.status === "dead_letter_queue") {
            clearInterval(interval);
            setIsSimulatingDlq(false);
            setDlqLogs((prev) => [
              ...prev,
              `[Alert Manager] Max retries exhausted (${rec.attempt_count}/${rec.max_retries}).`,
              `[DLQ Router] Job moved to DEAD LETTER QUEUE (DLQ). S3 audio preserved for zero-upload replay.`,
            ]);
          }
        } catch (err: any) {
          clearInterval(interval);
          setIsSimulatingDlq(false);
        }
      }, 1000);
    } catch (err: any) {
      setIsSimulatingDlq(false);
      setDlqLogs((prev) => [...prev, `[Error] ${err.message}`]);
    }
  };

  /**
   * Re-queues a job from the Dead Letter Queue back to the worker pool.
   * WHAT: Calls POST /api/v1/transcriptions/:jobId/retry to recover without re-upload.
   * WHY: Validates idempotency and manual or automated SRE remediation.
   */
  const handleRecoverDlq = async () => {
    if (!dlqJob) return;
    setIsRetryingDlq(true);
    setDlqLogs((prev) => [
      ...prev,
      `[SRE Action] Triggering POST /api/v1/transcriptions/${dlqJob.job_id}/retry...`,
    ]);

    try {
      const res = await retryDlqJob(dlqJob.job_id);
      setDlqLogs((prev) => [
        ...prev,
        `[Gateway] ${res.message}`,
        `[Worker] Job re-admitted to active processing pool.`,
      ]);
      const updated = await pollTranscriptionJob(dlqJob.job_id);
      setDlqJob(updated);
    } catch (err: any) {
      setDlqLogs((prev) => [...prev, `[Retry Failed] ${err.message}`]);
    } finally {
      setIsRetryingDlq(false);
    }
  };

  const postgresDDL = schemaData?.storage_architecture?.database?.ddl || `
CREATE TABLE transcription_jobs (
    job_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    s3_audio_uri TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    audio_duration_seconds NUMERIC(10, 2),
    model_name VARCHAR(64) NOT NULL,
    detected_language VARCHAR(16),
    language_probability NUMERIC(5, 4),
    transcript TEXT,
    segments JSONB, -- Structured timestamps & word alignments
    attempt_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GIN Index for rapid full-text & timestamp search over JSONB arrays
CREATE INDEX idx_transcription_segments_gin ON transcription_jobs USING GIN (segments);
CREATE INDEX idx_transcription_user_status ON transcription_jobs (user_id, status);
  `.trim();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Overview Header */}
      <div className="rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6e4dc] pb-6">
          <div>
            <div className="flex items-center gap-2 text-[#e85b48]">
              <Layers size={18} />
              <span className="font-mono text-xs font-bold uppercase tracking-[0.18em]">
                System Architecture Specification
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#263b48] sm:text-3xl">
              Production Scalability & Resilience Design
            </h2>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-[#f2eee3] px-3.5 py-1.5 font-mono text-xs font-semibold text-[#5a6461]">
            <Cpu size={14} className="text-[#e85b48]" />
            <span>Architecture Specification & Live Sandboxes</span>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            {
              id: "concurrency",
              label: "1. Concurrent Uploads",
              icon: Server,
            },
            {
              id: "storage",
              label: "2. Audio & DB Storage",
              icon: Database,
            },
            {
              id: "resilience",
              label: "3. Retries & DLQ",
              icon: RefreshCw,
            },
            {
              id: "api",
              label: "4. REST OpenAPI Spec",
              icon: Terminal,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                  isActive
                    ? "bg-[#263b48] text-[#fffaf0] shadow-sm"
                    : "bg-[#f3f0e7] text-[#55605d] hover:bg-[#eae6db]"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Concurrent Uploads */}
      {activeTab === "concurrency" && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6 rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-6 shadow-sm">
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#e85b48]">
                Architectural Principle
              </span>
              <h3 className="mt-1 text-xl font-bold text-[#263b48]">
                How to Handle Concurrent Uploads
              </h3>
            </div>

            <div className="space-y-4 text-sm leading-relaxed text-[#4e5b60]">
              <div className="rounded-xl border border-[#e2decfae] bg-[#f9f6ef] p-4">
                <h4 className="font-bold text-[#263b48] flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#263b48] text-[10px] text-white">
                    1
                  </span>
                  Presigned URL Direct Uploads
                </h4>
                <p className="mt-1 text-xs text-[#666f6c]">
                  Clients bypass API server memory by uploading raw audio directly to
                  AWS S3 or Cloud Storage buckets using short-lived (15-minute)
                  HMAC presigned PUT URLs. This prevents HTTP connection saturation and
                  removes server-side memory bottlenecks.
                </p>
              </div>

              <div className="rounded-xl border border-[#e2decfae] bg-[#f9f6ef] p-4">
                <h4 className="font-bold text-[#263b48] flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#263b48] text-[10px] text-white">
                    2
                  </span>
                  Asynchronous Task Queue (Redis / Celery / BullMQ)
                </h4>
                <p className="mt-1 text-xs text-[#666f6c]">
                  The API gateway enqueues a light job descriptor and returns an
                  immediate <strong>HTTP 202 Accepted</strong> response containing a
                  unique <code className="bg-[#ede9dc] px-1 py-0.5 rounded font-mono">job_id</code> and
                  polling URI (<code className="bg-[#ede9dc] px-1 py-0.5 rounded font-mono">/api/v1/transcriptions/:jobId</code>).
                </p>
              </div>

              <div className="rounded-xl border border-[#e2decfae] bg-[#f9f6ef] p-4">
                <h4 className="font-bold text-[#263b48] flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#263b48] text-[10px] text-white">
                    3
                  </span>
                  Worker Autoscaling & Capacity Throttling
                </h4>
                <p className="mt-1 text-xs text-[#666f6c]">
                  Autonomous background worker pools consume tasks from the queue based
                  on available GPU VRAM. Kubernetes Horizontal Pod Autoscaler (HPA)
                  scales pods based on queue depth metrics.
                </p>
              </div>
            </div>
          </div>

          {/* Live Concurrency Sandbox */}
          <div className="space-y-4 rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#e85b48]">
                  Live Test Sandbox
                </span>
                <h3 className="text-lg font-bold text-[#263b48]">
                  Test HTTP 202 Accepted Task Queue
                </h3>
              </div>
              <button
                onClick={handleRunAsyncDispatch}
                disabled={isSubmittingAsync}
                className="flex items-center gap-2 rounded-xl bg-[#e85b48] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#d64f3c] disabled:opacity-50"
              >
                {isSubmittingAsync ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                <span>{isSubmittingAsync ? "Processing Job..." : "Dispatch Async Task"}</span>
              </button>
            </div>

            {/* Console Log Window */}
            <div className="rounded-xl border border-[#263b48] bg-[#1a2933] p-4 font-mono text-xs text-[#e4edea]">
              <div className="mb-2 flex items-center justify-between border-b border-[#2d4251] pb-2 text-[10px] text-[#8ea3b0]">
                <span>Queue Event Stream</span>
                <span>POST /api/v1/transcriptions</span>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {asyncLog.length === 0 ? (
                  <p className="text-[#657d8c]">
                    Click "Dispatch Async Task" to trigger a real 202 Accepted job and live status polling.
                  </p>
                ) : (
                  asyncLog.map((line, idx) => (
                    <p
                      key={idx}
                      className={
                        line.includes("202 Accepted")
                          ? "font-bold text-[#56d364]"
                          : line.includes("Completed")
                          ? "font-bold text-[#79c0ff]"
                          : "text-[#d1dbe0]"
                      }
                    >
                      {line}
                    </p>
                  ))
                )}
              </div>
            </div>

            {/* Live Job Inspector */}
            {asyncJob && (
              <div className="rounded-xl border border-[#d5d4cb] bg-[#f9f6ef] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#263b48]">
                    Job ID: {asyncJob.job_id}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                      asyncJob.status === "completed"
                        ? "bg-[#2e7d32] text-white"
                        : "bg-[#e85b48] text-white"
                    }`}
                  >
                    {asyncJob.status}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#525f5c]">
                  <div>
                    <span className="text-[10px] uppercase text-[#8b9491] block">Storage URI</span>
                    <span className="font-mono text-[11px] truncate block">{asyncJob.s3_object_path}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-[#8b9491] block">Latency / Words</span>
                    <span>
                      {asyncJob.result?.metrics?.inferenceLatencyMs}ms ·{" "}
                      {asyncJob.result?.metrics?.totalWords} words
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Storage Architecture */}
      {activeTab === "storage" && (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Object Storage Specification */}
          <div className="space-y-5 rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-6 shadow-sm">
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#e85b48]">
                Object Storage Architecture
              </span>
              <h3 className="mt-1 text-xl font-bold text-[#263b48]">
                Audio Asset Retention & Lifecycle
              </h3>
            </div>

            <div className="space-y-4 text-sm leading-relaxed text-[#4e5b60]">
              <p>
                Audio files represent the heaviest storage footprint in the pipeline.
                They must never be stored as raw BLOBs in relational databases.
              </p>

              <div className="rounded-xl border border-[#dedad0] bg-[#f9f6ef] p-4 font-mono text-xs">
                <div className="text-[#8b9491] text-[10px] uppercase mb-1">
                  Structured S3 Key Layout
                </div>
                <div className="font-bold text-[#263b48]">
                  s3://prod-whisper-audio-lake/audios/{"{user_id}"}/{"{job_id}"}.mp3
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="mt-0.5 text-[#2e7d32] shrink-0" />
                  <span>
                    <strong>Cold Storage Transitions:</strong> S3 Lifecycle rule moves audio
                    to Amazon S3 Glacier Flexible Retrieval after 30 days.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="mt-0.5 text-[#2e7d32] shrink-0" />
                  <span>
                    <strong>Zero-Upload Idempotency:</strong> Because the original audio remains
                    safe in S3, failed transcription jobs can be re-run directly without
                    forcing users to upload multi-megabyte files again.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="mt-0.5 text-[#2e7d32] shrink-0" />
                  <span>
                    <strong>Encryption:</strong> Server-Side Encryption with KMS (SSE-KMS)
                    enforced for compliance.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Database Schema Specification */}
          <div className="space-y-4 rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#e85b48]">
                  Relational Schema (PostgreSQL)
                </span>
                <h3 className="text-lg font-bold text-[#263b48]">
                  PostgreSQL 16 + JSONB GIN Indexing
                </h3>
              </div>
              <button
                onClick={() => copyToClipboard(postgresDDL, "ddl")}
                className="flex items-center gap-1.5 rounded-lg border border-[#c9c5ba] bg-[#f9f6ef] px-3 py-1.5 text-xs font-bold text-[#263b48] hover:bg-[#eeeae0]"
              >
                {copiedCode === "ddl" ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedCode === "ddl" ? "Copied" : "Copy DDL"}</span>
              </button>
            </div>

            <div className="rounded-xl border border-[#263b48] bg-[#1a2933] p-4 font-mono text-[11px] text-[#e4edea]">
              <pre className="overflow-x-auto whitespace-pre leading-5">
                {postgresDDL}
              </pre>
            </div>

            <p className="text-xs text-[#6e7774] leading-relaxed">
              <strong>Why JSONB?</strong> Segments and word timestamps have variable lengths and
              dynamic confidence levels. Using a <code className="font-mono bg-[#ede9dc] px-1 rounded">segments JSONB</code> column
              with a GIN index allows millisecond phrase lookups and timestamp searches without complex table joins.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Resilience & DLQ */}
      {activeTab === "resilience" && (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Resilience Strategy */}
          <div className="space-y-6 rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-6 shadow-sm">
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#e85b48]">
                Fault-Tolerance Architecture
              </span>
              <h3 className="mt-1 text-xl font-bold text-[#263b48]">
                Retries, Exponential Backoff & DLQ
              </h3>
            </div>

            <div className="space-y-4 text-sm leading-relaxed text-[#4e5b60]">
              <div className="rounded-xl border border-[#dedad0] bg-[#f9f6ef] p-4">
                <h4 className="font-bold text-[#263b48] flex items-center gap-2">
                  <RefreshCw size={15} className="text-[#e85b48]" />
                  Automatic Retries with Exponential Backoff
                </h4>
                <p className="mt-1 text-xs text-[#666f6c]">
                  Worker processes automatically retry transient failures (CUDA out-of-memory,
                  network disconnects, rate limits). The backoff delay scales exponentially:
                  <br />
                  <code className="mt-1.5 inline-block font-mono bg-[#ede9dc] px-2 py-0.5 rounded text-[#263b48]">
                    delay_ms = 1000 * 2^(attempt - 1)  // 1s, 2s, 4s
                  </code>
                </p>
              </div>

              <div className="rounded-xl border border-[#dedad0] bg-[#f9f6ef] p-4">
                <h4 className="font-bold text-[#263b48] flex items-center gap-2">
                  <ShieldAlert size={15} className="text-[#c62828]" />
                  Dead Letter Queue (DLQ) Isolation
                </h4>
                <p className="mt-1 text-xs text-[#666f6c]">
                  When a corrupted audio file or repeated exception exhausts max retries (3 attempts),
                  it is immediately routed to the Dead Letter Queue. This prevents poison pills from
                  blocking subsequent queue workers.
                </p>
              </div>

              <div className="rounded-xl border border-[#dedad0] bg-[#f9f6ef] p-4">
                <h4 className="font-bold text-[#263b48] flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-[#2e7d32]" />
                  Zero-Upload Re-Queueing
                </h4>
                <p className="mt-1 text-xs text-[#666f6c]">
                  Engineers can inspect DLQ diagnostics and invoke{" "}
                  <code className="font-mono bg-[#ede9dc] px-1 py-0.5 rounded">POST /api/v1/transcriptions/:jobId/retry</code>{" "}
                  to re-process the audio directly from S3 storage.
                </p>
              </div>
            </div>
          </div>

          {/* Live Resilience Sandbox */}
          <div className="space-y-4 rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#e85b48]">
                  Interactive Failure Simulation
                </span>
                <h3 className="text-lg font-bold text-[#263b48]">
                  Simulate Fault, Backoff & DLQ
                </h3>
              </div>
              <button
                onClick={handleSimulateDlq}
                disabled={isSimulatingDlq}
                className="flex items-center gap-2 rounded-xl bg-[#c62828] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#b71c1c] disabled:opacity-50"
              >
                {isSimulatingDlq ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <AlertTriangle size={14} />
                )}
                <span>{isSimulatingDlq ? "Simulating..." : "Simulate Fault & DLQ"}</span>
              </button>
            </div>

            {/* DLQ Event Log Window */}
            <div className="rounded-xl border border-[#263b48] bg-[#1a2933] p-4 font-mono text-xs text-[#e4edea]">
              <div className="mb-2 flex items-center justify-between border-b border-[#2d4251] pb-2 text-[10px] text-[#8ea3b0]">
                <span>Resilience Event Stream</span>
                <span>Retries & DLQ Controller</span>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {dlqLogs.length === 0 ? (
                  <p className="text-[#657d8c]">
                    Click "Simulate Fault & DLQ" to watch exponential backoff attempts and DLQ isolation in action.
                  </p>
                ) : (
                  dlqLogs.map((log, idx) => (
                    <p
                      key={idx}
                      className={
                        log.includes("DEAD LETTER QUEUE")
                          ? "font-bold text-[#ff8080]"
                          : log.includes("Worker Retry")
                          ? "text-[#ffd54f]"
                          : log.includes("re-admitted")
                          ? "font-bold text-[#81c784]"
                          : "text-[#d1dbe0]"
                      }
                    >
                      {log}
                    </p>
                  ))
                )}
              </div>
            </div>

            {/* DLQ Recovery Action */}
            {dlqJob && dlqJob.status === "dead_letter_queue" && (
              <div className="flex items-center justify-between rounded-xl border border-[#ff8080] bg-[#fff5f5] p-4">
                <div>
                  <span className="font-mono text-xs font-bold text-[#c62828] block">
                    Job in Dead Letter Queue ({dlqJob.job_id})
                  </span>
                  <span className="text-[11px] text-[#782626]">
                    Audio preserved in S3. Ready for zero-upload re-queueing.
                  </span>
                </div>
                <button
                  onClick={handleRecoverDlq}
                  disabled={isRetryingDlq}
                  className="flex items-center gap-1.5 rounded-xl bg-[#263b48] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#1a2831] disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isRetryingDlq ? "animate-spin" : ""} />
                  <span>{isRetryingDlq ? "Re-queueing..." : "Recover from DLQ"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: REST / OpenAPI Spec */}
      {activeTab === "api" && (
        <div className="space-y-6 rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-6 shadow-sm sm:p-8">
          <div>
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#e85b48]">
              API Interface Specification
            </span>
            <h3 className="mt-1 text-2xl font-bold text-[#263b48]">
              REST / OpenAPI Endpoints
            </h3>
            <p className="mt-2 text-sm text-[#4e5b60]">
              The speech-to-text pipeline exposes both synchronous and asynchronous OpenAPI interfaces.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Endpoint 1: POST /api/v1/transcriptions */}
            <div className="rounded-xl border border-[#dedad0] bg-[#f9f6ef] p-5">
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#263b48] px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  POST
                </span>
                <code className="font-mono text-xs font-bold text-[#263b48]">
                  /api/v1/transcriptions
                </code>
                <span className="ml-auto rounded-full bg-[#e8f5e9] px-2 py-0.5 font-mono text-[10px] font-bold text-[#2e7d32]">
                  202 Accepted
                </span>
              </div>
              <p className="mt-2 text-xs text-[#666f6c]">
                Initiates asynchronous transcription. Ingests audio or presigned S3 reference,
                enqueues job, and returns immediate polling identifier.
              </p>

              <div className="mt-4">
                <div className="text-[10px] font-bold uppercase text-[#8b9491] mb-1">
                  Example Response (202 Accepted)
                </div>
                <pre className="rounded-lg bg-[#1a2933] p-3 font-mono text-[11px] text-[#e4edea] overflow-x-auto">
{`{
  "job_id": "tx_fa998278f0",
  "status": "queued",
  "status_url": "/api/v1/transcriptions/tx_fa998278f0",
  "created_at": "2026-09-11T16:30:00Z",
  "s3_object_path": "/audios/usr_102/tx_fa998278f0.wav",
  "model": "whisper-large-v3"
}`}
                </pre>
              </div>
            </div>

            {/* Endpoint 2: GET /api/v1/transcriptions/:jobId */}
            <div className="rounded-xl border border-[#dedad0] bg-[#f9f6ef] p-5">
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#2e7d32] px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  GET
                </span>
                <code className="font-mono text-xs font-bold text-[#263b48]">
                  /api/v1/transcriptions/:jobId
                </code>
                <span className="ml-auto rounded-full bg-[#f3f0e7] px-2 py-0.5 font-mono text-[10px] font-bold text-[#737b77]">
                  200 OK
                </span>
              </div>
              <p className="mt-2 text-xs text-[#666f6c]">
                Polls current task state (<code className="font-mono text-[10px]">queued | processing | completed | dead_letter_queue</code>).
                When completed, returns full transcript with segment and word timestamps.
              </p>

              <div className="mt-4">
                <div className="text-[10px] font-bold uppercase text-[#8b9491] mb-1">
                  cURL Command
                </div>
                <div className="flex items-center justify-between rounded-lg bg-[#1a2933] p-3 font-mono text-[11px] text-[#e4edea]">
                  <code>curl -s http://localhost:3000/api/v1/transcriptions/tx_fa998278f0</code>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        "curl -s http://localhost:3000/api/v1/transcriptions/tx_fa998278f0",
                        "curl"
                      )
                    }
                    className="text-[#8ea3b0] hover:text-white"
                  >
                    {copiedCode === "curl" ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

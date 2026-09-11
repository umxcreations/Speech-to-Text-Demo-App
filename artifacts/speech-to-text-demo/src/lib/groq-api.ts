/**
 * groq-api.ts
 *
 * Frontend Client Library for Speech-to-Text Pipeline (Sync & Async Part 2 System Design)
 *
 * WHAT THIS FILE DOES:
 * 1. Defines TypeScript interfaces for segments, word timestamps, signal metadata, and async jobs.
 * 2. Provides robust HTTP helpers with explicit JSON error parsing and status code translation.
 * 3. Supports both synchronous sub-second inference (POST /api/transcribe) and enterprise
 *    asynchronous queue processing (POST /api/v1/transcriptions -> 202 Accepted + Polling).
 * 4. Exposes Dead Letter Queue (DLQ) retry triggers and system design schema inspection.
 *
 * WHY THIS IS NEEDED:
 * - Ensures type safety across network boundaries.
 * - Prevents client crashes caused by unexpected HTML responses or gateway timeouts.
 */

export interface AudioSignalMetadata {
  format: string;
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  peakAmplitude: number;
  rmsPower: number;
  speechRatio: number;
  pcmByteLength: number;
  totalSamples: number;
}

export interface GroqConfig {
  hasGroqKey: boolean;
  maskedKey: string | null;
  supportedModels: Array<{
    id: string;
    name: string;
    description: string;
    speed: string;
  }>;
  defaultModel: string;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: WordTimestamp[];
}

export interface TranscriptionMetrics {
  inferenceLatencyMs?: number;
  fileSizeBytes?: number;
  fileName?: string;
  totalWords?: number;
  totalSegments?: number;
}

export interface TranscriptionResult {
  jobId: string;
  status: string;
  model: string;
  detectedLanguage: string;
  languageProbability: number;
  audioDurationSeconds: number;
  transcript: string;
  segments: TranscriptSegment[];
  metrics?: TranscriptionMetrics;
  audioMetadata?: AudioSignalMetadata;
}

export interface AsyncJobRecord {
  job_id: string;
  user_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "dead_letter_queue";
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  s3_object_path: string;
  model: string;
  attempt_count: number;
  max_retries: number;
  last_error?: string;
  dlq_reason?: string;
  retry_history?: Array<{
    attempt: number;
    timestamp: string;
    error: string;
    nextDelayMs: number;
  }>;
  result?: TranscriptionResult;
}

export interface TranscribeParams {
  file?: File | Blob;
  fileName?: string;
  mimeType?: string;
  audioBase64?: string;
  model?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  apiKey?: string;
  simulateFailure?: boolean;
}

async function parseResponse<T>(res: Response, fallbackError: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text();

  let data: any = null;
  if (
    contentType.includes("application/json") ||
    rawText.trim().startsWith("{") ||
    rawText.trim().startsWith("[")
  ) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (data && (data.error || data.message)) {
      throw new Error(data.error || data.message);
    }
    if (res.status === 413) {
      throw new Error(
        "The audio file is too large (maximum 25 MB). Please choose a shorter or compressed audio file."
      );
    }
    if (res.status === 401) {
      throw new Error(
        "Invalid or expired Groq API key. Please check your API key in the configuration modal."
      );
    }
    if (res.status === 429) {
      throw new Error(
        "Groq API rate limit exceeded. Please wait a moment and try again."
      );
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(
        "Speech recognition server is warming up or temporarily busy. Please retry in a few seconds."
      );
    }
    if (rawText.trim().startsWith("<") || contentType.includes("text/html")) {
      throw new Error(
        `Server returned status ${res.status}. Please ensure the server is ready and try again.`
      );
    }
    throw new Error(`${fallbackError} (HTTP ${res.status})`);
  }

  if (!data) {
    throw new Error("Invalid response format received from speech server.");
  }

  return data as T;
}

/**
 * Fetches server configuration (Groq availability, masked key, supported models).
 */
export async function fetchGroqConfig(): Promise<GroqConfig> {
  const res = await fetch("/api/transcribe/config");
  return parseResponse<GroqConfig>(res, "Failed to load Groq configuration");
}

/**
 * Validates a custom user-provided Groq API key.
 */
export async function testGroqApiKey(apiKey?: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  whisperModels?: string[];
}> {
  const res = await fetch("/api/transcribe/test-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: apiKey || undefined }),
  });
  return parseResponse<{
    success: boolean;
    message?: string;
    error?: string;
    whisperModels?: string[];
  }>(res, "Failed to validate Groq API key");
}

/**
 * Synchronous Speech-to-Text Pipeline (Part 1).
 * WHAT: Ingests audio file, standardizes signal via in-memory FFmpeg to 16kHz mono PCM,
 *       executes Groq Whisper LPU inference, and returns segment/word timestamps.
 * WHY: Delivers sub-second turnaround for interactive speech recording and transcription.
 */
export async function transcribeWithGroq(
  params: TranscribeParams
): Promise<TranscriptionResult> {
  const formData = new FormData();

  if (params.file) {
    formData.append("file", params.file, params.fileName || "audio.wav");
  } else if (params.audioBase64) {
    formData.append("audioBase64", params.audioBase64);
    if (params.fileName) formData.append("fileName", params.fileName);
    if (params.mimeType) formData.append("mimeType", params.mimeType);
  } else {
    throw new Error("No audio data provided to transcription service.");
  }

  if (params.model) formData.append("model", params.model);
  if (params.language) formData.append("language", params.language);
  if (params.prompt) formData.append("prompt", params.prompt);
  if (params.temperature != null)
    formData.append("temperature", String(params.temperature));

  const headers: Record<string, string> = {};
  if (params.apiKey) {
    headers["x-groq-api-key"] = params.apiKey;
  }

  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers,
    body: formData,
  });

  return parseResponse<TranscriptionResult>(
    res,
    "Transcription request failed"
  );
}

/**
 * Asynchronous Task Queue Submission (Part 2 System Design).
 * WHAT: Submits audio to the async queue, receiving HTTP 202 Accepted and a unique job_id.
 * WHY: Decouples HTTP request lifecycle from heavy model computation, preventing timeouts.
 */
export async function submitAsyncTranscription(
  params: TranscribeParams
): Promise<{
  job_id: string;
  status: string;
  status_url: string;
  created_at: string;
  s3_object_path: string;
  message: string;
}> {
  const formData = new FormData();

  if (params.file) {
    formData.append("file", params.file, params.fileName || "audio.wav");
  } else if (params.audioBase64) {
    formData.append("audioBase64", params.audioBase64);
  }

  if (params.model) formData.append("model", params.model);
  if (params.language) formData.append("language", params.language);
  if (params.prompt) formData.append("prompt", params.prompt);
  if (params.simulateFailure) formData.append("simulateFailure", "true");

  const res = await fetch("/api/v1/transcriptions", {
    method: "POST",
    body: formData,
  });

  return parseResponse<{
    job_id: string;
    status: string;
    status_url: string;
    created_at: string;
    s3_object_path: string;
    message: string;
  }>(res, "Failed to submit asynchronous transcription job");
}

/**
 * Polls status of an asynchronous job by jobId.
 */
export async function pollTranscriptionJob(jobId: string): Promise<AsyncJobRecord> {
  const res = await fetch(`/api/v1/transcriptions/${jobId}`);
  return parseResponse<AsyncJobRecord>(res, "Failed to poll transcription job");
}

/**
 * Lists recent jobs in the task queue.
 */
export async function listRecentJobs(): Promise<{
  total: number;
  jobs: Array<{
    job_id: string;
    status: string;
    file_name: string;
    file_size_bytes: number;
    model: string;
    created_at: string;
    attempt_count: number;
    has_result: boolean;
  }>;
}> {
  const res = await fetch("/api/v1/transcriptions");
  return parseResponse<any>(res, "Failed to fetch task queue jobs");
}

/**
 * Re-queues a failed job from the Dead Letter Queue (DLQ).
 */
export async function retryDlqJob(jobId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/v1/transcriptions/${jobId}/retry`, { method: "POST" });
  return parseResponse<{ success: boolean; message: string }>(res, "Failed to retry DLQ job");
}

/**
 * Fetches the architectural schema metadata for Part 2 System Design inspection.
 */
export async function fetchSystemDesignSchema(): Promise<{
  storage_architecture: {
    object_storage: {
      provider: string;
      bucket_name: string;
      key_structure: string;
      encryption: string;
      lifecycle_policy: string;
    };
    database: {
      engine: string;
      table_name: string;
      ddl: string;
    };
  };
  resilience_architecture: {
    retry_policy: string;
    max_attempts: number;
    dead_letter_queue: string;
    idempotency: string;
  };
  api_endpoints: Record<string, string>;
}> {
  const res = await fetch("/api/v1/system-design/schema");
  return parseResponse<any>(res, "Failed to fetch system design schema");
}

/**
 * Deterministic fixture fallback (for offline or local unit test checks).
 */
export async function transcribeDemo(params: {
  fileName: string;
  fileSizeBytes: number;
  durationSeconds: number;
  language?: string;
}): Promise<TranscriptionResult> {
  const res = await fetch("/api/transcribe/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return parseResponse<TranscriptionResult>(
    res,
    "Demo transcription request failed"
  );
}

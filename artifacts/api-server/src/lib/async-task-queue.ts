/**
 * async-task-queue.ts
 *
 * Part 2: Production Asynchronous Task Queue & Resilience Architecture
 *
 * WHAT THIS MODULE DOES:
 * 1. Simulates an enterprise message broker & worker queue (such as Redis/BullMQ or Celery/RabbitMQ).
 * 2. Implements asynchronous job dispatch: accepts audio jobs immediately, returns HTTP 202 Accepted
 *    with a unique jobId and polling endpoint, decoupling client HTTP connections from long-running ASR.
 * 3. Enforces an exponential backoff retry mechanism (up to 3 attempts with 2^n backoff delays) for
 *    handling transient faults (rate limits, GPU VRAM spikes, network blips).
 * 4. Routes unrecoverable poison jobs to a Dead Letter Queue (DLQ) for diagnostic audit and alerting.
 * 5. Simulates object storage S3/GCS keys (`/audios/{userId}/{jobId}.wav`) and structured PostgreSQL
 *    metadata records with JSONB segment storage.
 *
 * WHY THIS IS NEEDED FOR PRODUCTION ARCHITECTURE:
 * - Prevents HTTP gateway timeouts (typically 30s-60s) on multi-minute audio files.
 * - Protects GPU / LPU inference workers from concurrent traffic spikes through queue buffering.
 * - Guarantees at-least-once processing semantics without forcing clients to re-upload large audio files.
 */

import { createHash } from "node:crypto";
import type { TranscriptionResult } from "../../../speech-to-text-demo/src/lib/groq-api";

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "dead_letter_queue";

export interface TranscriptionJobRecord {
  jobId: string;
  userId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  
  // Audio & Object Storage references
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  s3ObjectPath: string; // Structured S3 path: /audios/{userId}/{jobId}.wav
  
  // Model inference parameters
  model: string;
  language?: string;
  prompt?: string;
  temperature: number;
  
  // Retry & Resilience state
  attemptCount: number;
  maxRetries: number;
  lastError?: string;
  dlqReason?: string;
  retryHistory: Array<{
    attempt: number;
    timestamp: string;
    error: string;
    nextDelayMs: number;
  }>;
  
  // Completed result payload (mapped to PostgreSQL JSONB column)
  result?: TranscriptionResult;
}

export interface EnqueueOptions {
  audioBuffer: Buffer;
  fileName: string;
  mimeType: string;
  userId?: string;
  model?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  simulateFailure?: boolean; // For testing DLQ & retry recovery in UI
}

class AsyncTaskQueueManager {
  private jobs: Map<string, TranscriptionJobRecord> = new Map();
  private audioPayloads: Map<string, Buffer> = new Map();
  private isWorkerLoopRunning = false;

  /**
   * Enqueues a new transcription task into the asynchronous worker queue.
   * WHAT: Generates an immutable jobId, resolves structured S3 storage URI, records metadata,
   *       and schedules background processing.
   * WHY: Returns HTTP 202 Accepted immediately so clients never block during heavy model inference.
   */
  public enqueue(options: EnqueueOptions): TranscriptionJobRecord {
    const userId = options.userId || "usr_default_anon";
    const timestamp = Date.now();
    const hash = createHash("sha256")
      .update(`${options.fileName}:${timestamp}:${Math.random()}`)
      .digest("hex")
      .slice(0, 12);
    const jobId = `tx_${hash}`;
    const s3ObjectPath = `/audios/${userId}/${jobId}.wav`;

    const jobRecord: TranscriptionJobRecord = {
      jobId,
      userId,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileName: options.fileName,
      fileSizeBytes: options.audioBuffer.length,
      mimeType: options.mimeType,
      s3ObjectPath,
      model: options.model || "whisper-large-v3",
      language: options.language,
      prompt: options.prompt,
      temperature: options.temperature ?? 0,
      attemptCount: 0,
      maxRetries: 3,
      retryHistory: [],
    };

    this.jobs.set(jobId, jobRecord);
    this.audioPayloads.set(jobId, options.audioBuffer);

    // Trigger background queue processor loop
    setTimeout(() => {
      this.processJob(jobId, options.simulateFailure).catch((err) => {
        console.error(`[QueueWorker] Unhandled error processing job ${jobId}:`, err);
      });
    }, 100);

    return jobRecord;
  }

  /**
   * Retrieves an existing job record by ID.
   */
  public getJob(jobId: string): TranscriptionJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Lists recent jobs for the dashboard/inspector.
   */
  public listJobs(limit = 20): TranscriptionJobRecord[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Processes a single queued job with automatic exponential backoff retry semantics.
   * WHAT: Executes the transcription pipeline; if a transient failure occurs, calculates
   *       exponential delay `base_delay * (2 ^ attempt)` and reschedules. If attempts reach
   *       maxRetries, transitions the job state to 'dead_letter_queue'.
   * WHY: Prevents system crashes from unhandled poison pills while allowing transient network
   *       or quota glitches to resolve automatically.
   */
  public async processJob(jobId: string, simulateFailure = false): Promise<void> {
    const job = this.jobs.get(jobId);
    const audioBuffer = this.audioPayloads.get(jobId);

    if (!job || !audioBuffer) return;

    job.status = "processing";
    job.startedAt = job.startedAt || new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    job.attemptCount += 1;

    console.log(
      `[QueueWorker] Processing job ${job.jobId} (Attempt ${job.attemptCount}/${job.maxRetries})`
    );

    try {
      if (simulateFailure) {
        throw new Error("Simulated transient GPU memory exhaustion / upstream rate limit (429).");
      }

      // Delegate to standardized Groq transcription execution
      const { executeGroqTranscription } = await import("../routes/transcription-service");
      const result = await executeGroqTranscription({
        audioBuffer,
        fileName: job.fileName,
        mimeType: job.mimeType,
        model: job.model,
        language: job.language,
        prompt: job.prompt,
        temperature: job.temperature,
      });

      job.status = "completed";
      job.result = result;
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();
      console.log(`[QueueWorker] Successfully completed job ${job.jobId}`);
    } catch (err: any) {
      const errorMsg = err?.message || "Inference execution failed.";
      job.lastError = errorMsg;
      job.updatedAt = new Date().toISOString();

      if (job.attemptCount < job.maxRetries) {
        // Calculate exponential backoff delay (e.g., attempt 1 = 1s, attempt 2 = 2s, attempt 3 = 4s)
        const delayMs = Math.pow(2, job.attemptCount - 1) * 1000;
        job.retryHistory.push({
          attempt: job.attemptCount,
          timestamp: new Date().toISOString(),
          error: errorMsg,
          nextDelayMs: delayMs,
        });

        console.warn(
          `[QueueWorker] Job ${job.jobId} failed attempt ${job.attemptCount}. Retrying in ${delayMs}ms...`
        );

        setTimeout(() => {
          this.processJob(jobId, simulateFailure).catch(console.error);
        }, delayMs);
      } else {
        // Exhausted max retries -> Move to Dead Letter Queue (DLQ)
        job.status = "dead_letter_queue";
        job.dlqReason = `Exhausted ${job.maxRetries} retry attempts without success. Last error: ${errorMsg}`;
        console.error(
          `[QueueWorker] Job ${job.jobId} permanently failed. Moved to Dead Letter Queue (DLQ).`
        );
      }
    }
  }

  /**
   * Resubmits a job from the Dead Letter Queue (DLQ) for reprocessing.
   * WHAT: Resets the attempt counter and transitions status back to 'queued'.
   * WHY: Enables SREs/engineers to re-run jobs after fixing underlying issues without re-uploading audio.
   */
  public retryDlqJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "dead_letter_queue") return false;

    job.status = "queued";
    job.attemptCount = 0;
    job.lastError = undefined;
    job.dlqReason = undefined;
    job.updatedAt = new Date().toISOString();

    setTimeout(() => {
      this.processJob(jobId, false).catch(console.error);
    }, 100);

    return true;
  }
}

export const taskQueue = new AsyncTaskQueueManager();

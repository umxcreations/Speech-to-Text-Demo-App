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
}

export async function fetchGroqConfig(): Promise<GroqConfig> {
  const res = await fetch("/api/transcribe/config");
  if (!res.ok) {
    throw new Error(`Failed to load Groq configuration: ${res.statusText}`);
  }
  return res.json();
}

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
  return res.json();
}

export async function transcribeWithGroq(
  params: TranscribeParams
): Promise<TranscriptionResult> {
  const formData = new FormData();

  if (params.file) {
    const filename =
      params.fileName ||
      (params.file instanceof File ? params.file.name : "recording.wav");
    formData.append("file", params.file, filename);
  } else if (params.audioBase64) {
    formData.append("audioBase64", params.audioBase64);
    if (params.fileName) formData.append("fileName", params.fileName);
    if (params.mimeType) formData.append("mimeType", params.mimeType);
  } else {
    throw new Error("No audio file or data provided for transcription.");
  }

  if (params.model) formData.append("model", params.model);
  if (params.language) formData.append("language", params.language);
  if (params.prompt) formData.append("prompt", params.prompt);
  if (params.temperature !== undefined)
    formData.append("temperature", String(params.temperature));
  if (params.apiKey) formData.append("apiKey", params.apiKey);

  const headers: Record<string, string> = {};
  if (params.apiKey) {
    headers["x-groq-api-key"] = params.apiKey;
  }

  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Transcription failed with status ${res.status}`);
  }

  return data;
}

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

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Demo transcription request failed");
  }

  return data;
}

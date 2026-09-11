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

export async function fetchGroqConfig(): Promise<GroqConfig> {
  const res = await fetch("/api/transcribe/config");
  return parseResponse<GroqConfig>(res, "Failed to load Groq configuration");
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
  return parseResponse<{
    success: boolean;
    message?: string;
    error?: string;
    whisperModels?: string[];
  }>(res, "Failed to validate Groq API key");
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

  return parseResponse<TranscriptionResult>(
    res,
    "Transcription request failed"
  );
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

  return parseResponse<TranscriptionResult>(
    res,
    "Demo transcription request failed"
  );
}

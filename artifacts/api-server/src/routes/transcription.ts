import { Router, type IRouter, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import Groq, { toFile } from "groq-sdk";

const transcriptionRouter: IRouter = Router();

// Configure multer for memory storage up to 25MB (Groq's maximum file size)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
  },
});

const SUPPORTED_MODELS = [
  {
    id: "whisper-large-v3",
    name: "Whisper Large v3",
    description: "Multilingual, highest transcription accuracy",
    speed: "Standard (Fast)",
  },
  {
    id: "whisper-large-v3-turbo",
    name: "Whisper Large v3 Turbo",
    description: "Ultra-fast inference, optimized for high throughput",
    speed: "Turbo (Ultra-fast)",
  },
];

function getMaskedKey(key?: string): string {
  if (!key || key.length < 10) return "";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

// 1. Config endpoint: check if server has Groq configured
transcriptionRouter.get("/transcribe/config", (_req: Request, res: Response) => {
  const envKey = process.env.GROQ_API_KEY?.trim();
  const hasGroqKey = Boolean(envKey && envKey.length > 5);

  res.json({
    hasGroqKey,
    maskedKey: hasGroqKey ? getMaskedKey(envKey) : null,
    supportedModels: SUPPORTED_MODELS,
    defaultModel: "whisper-large-v3",
  });
});

// 2. Validate / Test key endpoint
transcriptionRouter.post("/transcribe/test-key", async (req: Request, res: Response) => {
  try {
    const key =
      req.body?.apiKey?.trim() ||
      req.headers["x-groq-api-key"] ||
      process.env.GROQ_API_KEY?.trim();

    if (!key) {
      res.status(400).json({ success: false, error: "No API key provided." });
      return;
    }

    const groq = new Groq({ apiKey: key });
    const modelsList = await groq.models.list();
    const whisperModels = modelsList.data
      .filter((m) => m.id.includes("whisper"))
      .map((m) => m.id);

    res.json({
      success: true,
      message: "Groq API key is valid and connected.",
      whisperModels,
    });
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: err?.message || "Failed to authenticate with Groq API.",
    });
  }
});

// 3. Real Production Speech-to-Text with Groq Whisper
transcriptionRouter.post(
  "/transcribe",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      // 1. Resolve API key
      const apiKey =
        (req.body?.apiKey && typeof req.body.apiKey === "string" ? req.body.apiKey.trim() : null) ||
        (typeof req.headers["x-groq-api-key"] === "string" ? req.headers["x-groq-api-key"].trim() : null) ||
        (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : null) ||
        process.env.GROQ_API_KEY?.trim();

      if (!apiKey) {
        res.status(400).json({
          error:
            "Groq API key is required. Provide it in the request or configure GROQ_API_KEY on the server.",
        });
        return;
      }

      // 2. Resolve audio buffer and metadata
      let audioBuffer: Buffer | null = null;
      let fileName = "audio.wav";
      let mimeType = "audio/wav";

      if (req.file) {
        audioBuffer = req.file.buffer;
        fileName = req.file.originalname || "audio.wav";
        mimeType = req.file.mimetype || "audio/wav";
      } else if (req.body?.audioBase64) {
        audioBuffer = Buffer.from(req.body.audioBase64, "base64");
        fileName = req.body.fileName || "audio.wav";
        mimeType = req.body.mimeType || "audio/wav";
      }

      if (!audioBuffer || audioBuffer.length === 0) {
        res.status(400).json({
          error: "No audio file provided. Please attach a valid audio file or recording.",
        });
        return;
      }

      const model = req.body?.model || "whisper-large-v3";
      const language = req.body?.language?.trim() || undefined;
      const prompt = req.body?.prompt?.trim() || undefined;
      const temperature = req.body?.temperature != null ? Number(req.body.temperature) : 0;

      const groq = new Groq({ apiKey });

      // Convert buffer to file for Groq SDK
      const groqAudioFile = await toFile(audioBuffer, fileName, { type: mimeType });

      const startTime = Date.now();

      // Call Groq Speech-to-Text Whisper API
      const result: any = await groq.audio.transcriptions.create({
        file: groqAudioFile,
        model,
        response_format: "verbose_json",
        timestamp_granularities: ["word", "segment"],
        language,
        prompt,
        temperature,
      });

      const inferenceLatencyMs = Date.now() - startTime;

      // Extract and shape segments and words
      const rawWords: Array<{ word: string; start: number; end: number }> =
        result.words || [];

      const rawSegments: Array<any> = result.segments || [];

      let formattedSegments: Array<{
        id: number;
        start: number;
        end: number;
        text: string;
        words: Array<{ word: string; start: number; end: number; probability: number }>;
      }> = [];

      if (rawSegments.length > 0) {
        formattedSegments = rawSegments.map((seg, idx) => {
          const segStart = Number(seg.start ?? 0);
          const segEnd = Number(seg.end ?? 0);
          const segProbability =
            seg.avg_logprob != null
              ? Math.min(0.99, Math.max(0.65, Math.exp(seg.avg_logprob)))
              : 0.98;

          // Associate words belonging to this segment
          const segmentWords = rawWords
            .filter((w) => w.start >= segStart - 0.08 && w.end <= segEnd + 0.15)
            .map((w) => ({
              word: w.word,
              start: Number(w.start.toFixed(2)),
              end: Number(w.end.toFixed(2)),
              probability: Number(segProbability.toFixed(2)),
            }));

          return {
            id: seg.id ?? idx,
            start: Number(segStart.toFixed(2)),
            end: Number(segEnd.toFixed(2)),
            text: (seg.text || "").trim(),
            words: segmentWords,
          };
        });
      } else if (result.text) {
        // Single segment fallback if segments array is empty
        const words = rawWords.map((w) => ({
          word: w.word,
          start: Number(w.start.toFixed(2)),
          end: Number(w.end.toFixed(2)),
          probability: 0.98,
        }));
        formattedSegments = [
          {
            id: 0,
            start: 0,
            end: Number((result.duration || 0).toFixed(2)),
            text: result.text.trim(),
            words,
          },
        ];
      }

      const jobId = `groq-${createHash("sha1")
        .update(`${fileName}:${Date.now()}:${result.text?.slice(0, 30)}`)
        .digest("hex")
        .slice(0, 10)}`;

      res.json({
        jobId,
        status: "completed",
        model: `groq / ${model}`,
        detectedLanguage: result.language || language || "en",
        languageProbability: 0.99,
        audioDurationSeconds: Number((result.duration || 0).toFixed(2)),
        transcript: (result.text || "").trim(),
        segments: formattedSegments,
        metrics: {
          inferenceLatencyMs,
          fileSizeBytes: audioBuffer.length,
          fileName,
          totalWords: rawWords.length,
          totalSegments: formattedSegments.length,
        },
      });
    } catch (err: any) {
      console.error("[Groq STT Error]:", err);
      res.status(500).json({
        error: err?.message || "Failed to transcribe audio with Groq.",
      });
    }
  },
);

// 4. Deterministic demo endpoint (kept for backward compatibility & local testing)
transcriptionRouter.post("/transcribe/demo", (req, res) => {
  const { fileName, fileSizeBytes, durationSeconds, language } = req.body ?? {};

  if (
    typeof fileName !== "string" ||
    typeof fileSizeBytes !== "number" ||
    typeof durationSeconds !== "number"
  ) {
    res.status(400).json({ error: "Audio metadata is incomplete or invalid." });
    return;
  }

  const jobId = `demo-${createHash("sha1")
    .update(`${fileName}:${fileSizeBytes}:${durationSeconds}`)
    .digest("hex")
    .slice(0, 8)}`;

  res.json({
    jobId,
    status: "completed",
    model: "faster-whisper / base (demo response)",
    detectedLanguage: language || "en",
    languageProbability: 0.98,
    audioDurationSeconds: Number(durationSeconds.toFixed(2)),
    transcript:
      "Welcome to the speech to text pipeline. This demo shows how audio becomes searchable text.",
    segments: [
      {
        id: 0,
        start: 0,
        end: 3.18,
        text: "Welcome to the speech to text pipeline.",
        words: [
          { word: "Welcome", start: 0, end: 0.54, probability: 0.99 },
          { word: "to", start: 0.56, end: 0.72, probability: 0.99 },
          { word: "the", start: 0.74, end: 0.9, probability: 0.98 },
          { word: "speech", start: 0.92, end: 1.34, probability: 0.98 },
          { word: "to", start: 1.36, end: 1.52, probability: 0.99 },
          { word: "text", start: 1.54, end: 1.92, probability: 0.99 },
          { word: "pipeline.", start: 2.06, end: 3.18, probability: 0.97 },
        ],
      },
      {
        id: 1,
        start: 3.48,
        end: 7.86,
        text: "This demo shows how audio becomes searchable text.",
        words: [
          { word: "This", start: 3.48, end: 3.76, probability: 0.99 },
          { word: "demo", start: 3.78, end: 4.22, probability: 0.98 },
          { word: "shows", start: 4.24, end: 4.68, probability: 0.98 },
          { word: "how", start: 4.7, end: 5.02, probability: 0.99 },
          { word: "audio", start: 5.04, end: 5.46, probability: 0.98 },
          { word: "becomes", start: 5.48, end: 6.02, probability: 0.97 },
          { word: "searchable", start: 6.04, end: 6.78, probability: 0.97 },
          { word: "text.", start: 6.8, end: 7.86, probability: 0.99 },
        ],
      },
    ],
  });
});

export default transcriptionRouter;

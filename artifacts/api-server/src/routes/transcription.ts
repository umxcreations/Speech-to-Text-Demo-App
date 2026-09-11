import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";

const transcriptionRouter: IRouter = Router();

transcriptionRouter.post("/transcribe/demo", (req, res) => {
  const {
    fileName,
    mimeType,
    fileSizeBytes,
    durationSeconds,
    language,
  } = req.body ?? {};

  if (
    typeof fileName !== "string" ||
    typeof mimeType !== "string" ||
    typeof fileSizeBytes !== "number" ||
    typeof durationSeconds !== "number" ||
    fileSizeBytes < 0 ||
    durationSeconds < 0
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
import type { TranscriptSegment, TranscriptionResult } from "./groq-api";

function formatTimestampSRT(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function formatTimestampVTT(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function generateSRT(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, idx) => {
      const start = formatTimestampSRT(seg.start);
      const end = formatTimestampSRT(seg.end);
      return `${idx + 1}\n${start} --> ${end}\n${seg.text.trim()}\n`;
    })
    .join("\n");
}

export function generateVTT(segments: TranscriptSegment[]): string {
  const body = segments
    .map((seg, idx) => {
      const start = formatTimestampVTT(seg.start);
      const end = formatTimestampVTT(seg.end);
      return `${idx + 1}\n${start} --> ${end}\n${seg.text.trim()}\n`;
    })
    .join("\n");

  return `WEBVTT\n\n${body}`;
}

export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string = "text/plain;charset=utf-8"
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJSONFile(data: TranscriptionResult, filename: string) {
  downloadTextFile(
    JSON.stringify(data, null, 2),
    filename,
    "application/json;charset=utf-8"
  );
}

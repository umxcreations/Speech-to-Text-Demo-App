/**
 * audio-preprocessor.ts
 *
 * In-memory Audio Ingestion & Signal Standardization Pipeline
 *
 * WHAT THIS MODULE DOES:
 * 1. Accepts arbitrary audio container formats (WAV, MP3, M4A, FLAC, OGG, WebM, AAC) or raw byte streams.
 * 2. Uses an in-memory FFmpeg subprocess pipe (stdin -> stdout) to transcode, downmix, and resample
 *    the audio signal directly to 16,000 Hz single-channel (mono) 16-bit signed PCM (S16LE).
 * 3. Converts raw PCM bytes into normalized float32 samples in the range [-1.0, 1.0], matching the
 *    exact tensor input requirements of Whisper Transformer encoders.
 * 4. Extracts signal metrics including duration, RMS power, peak amplitude, and performs Voice Activity
 *    Detection (VAD) analysis to detect speech vs silence intervals.
 *
 * WHY THIS IS NEEDED FOR PRODUCTION SPEECH-TO-TEXT:
 * - Eliminates temporary disk I/O bottlenecks and file cleanup race conditions.
 * - Guarantees consistent model inference input regardless of user audio codec, bitrate, or channel count.
 * - Provides pre-inference audio quality diagnostics to detect corrupted or silent audio early.
 */

import { spawn } from "node:child_process";

export interface AudioSignalMetadata {
  format: string;
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  peakAmplitude: number;
  rmsPower: number;
  speechRatio: number; // Ratio of audio above silence threshold
  pcmByteLength: number;
  totalSamples: number;
}

export interface StandardizedAudioResult {
  /** Raw 16 kHz 16-bit mono PCM bytes (S16LE) */
  pcmBuffer: Buffer;
  /** Normalized float32 samples in [-1.0, 1.0], matching faster-whisper / numpy arrays */
  float32Samples: Float32Array;
  /** Extracted audio signal metrics */
  metadata: AudioSignalMetadata;
  /** Clean WAV container generated from standardized 16kHz mono PCM for model ingestion */
  standardWavBuffer: Buffer;
}

/**
 * Encodes raw 16kHz 16-bit mono PCM into a valid canonical WAV buffer in memory.
 * WHAT: Prepends a standard 44-byte RIFF/WAVE header to raw PCM samples.
 * WHY: APIs like Groq Whisper require a valid audio container header when sending files.
 */
function createWavHeader(pcmLength: number, sampleRate = 16000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44);

  // RIFF chunk descriptor
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcmLength, 4);
  buffer.write("WAVE", 8);

  // "fmt " sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // "data" sub-chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcmLength, 40);

  return buffer;
}

/**
 * Ingests an arbitrary audio buffer in memory and standardizes it to 16 kHz mono PCM.
 *
 * @param inputBuffer Raw bytes of arbitrary audio file (MP3, WAV, M4A, OGG, WebM, etc.)
 * @param targetSampleRate Target sampling rate (default: 16000 Hz for Whisper)
 * @returns Promise<StandardizedAudioResult>
 */
export async function standardizeAudioBuffer(
  inputBuffer: Buffer,
  targetSampleRate = 16000
): Promise<StandardizedAudioResult> {
  if (!inputBuffer || inputBuffer.length === 0) {
    throw new Error("Cannot standardize empty audio buffer.");
  }

  return new Promise((resolve, reject) => {
    /**
     * Spawns an in-memory FFmpeg subprocess pipe.
     * WHAT:
     * - '-i pipe:0': Reads raw incoming bytes directly from stdin stream.
     * - '-threads 0': Maximizes multi-core CPU decoding throughput.
     * - '-ac 1': Downmixes any stereo or multi-channel audio to single-channel mono.
     * - '-ar 16000': Resamples audio to 16,000 Hz, matching Whisper's Mel filterbank.
     * - '-f s16le': Outputs signed 16-bit little-endian raw PCM samples.
     * - '-acodec pcm_s16le': Standard uncompressed PCM audio codec.
     * - 'pipe:1': Streams output directly to stdout buffer without touching disk.
     *
     * WHY:
     * - Speech recognition models are trained specifically on 16kHz mono audio.
     * - Running in-memory avoids temporary disk writes, container storage spikes, and permissions issues.
     */
    const ffmpeg = spawn("ffmpeg", [
      "-threads", "0",
      "-i", "pipe:0",
      "-ac", "1",
      "-ar", targetSampleRate.toString(),
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "pipe:1",
    ]);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`Failed to spawn in-memory FFmpeg process: ${err.message}`));
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        const errorDetails = Buffer.concat(stderrChunks).toString("utf-8");
        return reject(
          new Error(
            `In-memory FFmpeg decoding failed (exit code ${code}): ${errorDetails.slice(-300)}`
          )
        );
      }

      const pcmBuffer = Buffer.concat(stdoutChunks);
      if (pcmBuffer.length === 0) {
        return reject(new Error("FFmpeg produced empty PCM stream from audio input."));
      }

      // Convert raw S16LE bytes to normalized float32 array in [-1.0, 1.0]
      // S16LE has 2 bytes per sample; maximum value of signed 16-bit integer is 32768
      const totalSamples = Math.floor(pcmBuffer.length / 2);
      const float32Samples = new Float32Array(totalSamples);

      let sumSquare = 0;
      let peak = 0;
      let activeSamples = 0;
      const silenceThreshold = 0.01; // -40dB amplitude threshold for VAD

      for (let i = 0; i < totalSamples; i++) {
        const int16 = pcmBuffer.readInt16LE(i * 2);
        const normalized = int16 / 32768.0;
        float32Samples[i] = normalized;

        const absVal = Math.abs(normalized);
        if (absVal > peak) peak = absVal;
        sumSquare += normalized * normalized;

        if (absVal >= silenceThreshold) {
          activeSamples++;
        }
      }

      const durationSeconds = Number((totalSamples / targetSampleRate).toFixed(3));
      const rmsPower = Math.sqrt(sumSquare / Math.max(1, totalSamples));
      const speechRatio = Number((activeSamples / Math.max(1, totalSamples)).toFixed(3));

      // Build canonical 16kHz mono WAV buffer for external API / model submission
      const wavHeader = createWavHeader(pcmBuffer.length, targetSampleRate, 1, 16);
      const standardWavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

      resolve({
        pcmBuffer,
        float32Samples,
        standardWavBuffer,
        metadata: {
          format: "pcm_s16le",
          sampleRate: targetSampleRate,
          channels: 1,
          durationSeconds,
          peakAmplitude: Number(peak.toFixed(4)),
          rmsPower: Number(rmsPower.toFixed(4)),
          speechRatio,
          pcmByteLength: pcmBuffer.length,
          totalSamples,
        },
      });
    });

    // Write incoming audio stream to FFmpeg stdin and close stream
    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}

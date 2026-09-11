// Audio sample generator using Web Audio API to produce real, valid WAV audio files in the browser

export interface AudioPreset {
  id: string;
  title: string;
  category: string;
  duration: number;
  description: string;
  spokenText: string;
  suggestedPrompt: string;
}

export const AUDIO_PRESETS: AudioPreset[] = [
  {
    id: "tech-architecture",
    title: "AI & Low Latency Inference",
    category: "Engineering Standup",
    duration: 5.5,
    description: "Speech sample discussing Whisper on Groq LPU inference hardware.",
    spokenText:
      "Whisper large v3 running on Groq LPU inference engine delivers high throughput speech to text with sub second word level timestamps.",
    suggestedPrompt: "Groq, LPU, Whisper, inference, timestamps, throughput",
  },
  {
    id: "customer-support",
    title: "Customer Support Call",
    category: "Customer Experience",
    duration: 6.2,
    description: "Sample dialogue from a customer support greeting and resolution.",
    spokenText:
      "Hello, thank you for calling customer service. I can help you verify your subscription and configure real time audio transcription today.",
    suggestedPrompt: "Customer service, account, transcription, subscription",
  },
  {
    id: "medical-consultation",
    title: "Clinical Consultation",
    category: "Healthcare",
    duration: 5.8,
    description: "Medical dictation with clinical terminology.",
    spokenText:
      "The patient presented with mild seasonal symptoms, normal blood pressure at one twenty over eighty, and clear respiratory sounds.",
    suggestedPrompt: "Blood pressure, seasonal symptoms, clinical examination",
  },
];

/**
 * Creates a valid, playable WAV Audio File from PCM samples
 */
export function encodeWavBlob(
  samples: Float32Array,
  sampleRate: number = 16000
): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF identifier
  writeString(0, "RIFF");
  // File length minus RIFF identifier & length
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type
  writeString(8, "WAVE");
  // Format chunk identifier
  writeString(12, "fmt ");
  // Format chunk length
  view.setUint32(16, 16, true);
  // Sample format (raw PCM)
  view.setUint16(20, 1, true);
  // Channel count (1 = mono)
  view.setUint16(22, 1, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (sampleRate * channelCount * bytesPerSample)
  view.setUint32(28, sampleRate * 2, true);
  // Block align (channelCount * bytesPerSample)
  view.setUint16(32, 2, true);
  // Bits per sample
  view.setUint16(34, 16, true);
  // Data chunk identifier
  writeString(36, "data");
  // Data chunk length
  view.setUint32(40, samples.length * 2, true);

  // Write PCM audio data with 16-bit clamping
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Generates an audio sample with voice harmonic formants
 */
export async function generatePresetAudioFile(preset: AudioPreset): Promise<File> {
  const sampleRate = 16000;
  const numSamples = Math.floor(preset.duration * sampleRate);
  const samples = new Float32Array(numSamples);

  // Synthesize rich speech-like vocal harmonic formants (F0 fundamental ~ 140Hz, F1 ~ 700Hz, F2 ~ 1220Hz, F3 ~ 2600Hz)
  const words = preset.spokenText.split(" ");
  const wordDuration = preset.duration / words.length;

  for (let w = 0; w < words.length; w++) {
    const wordStartSample = Math.floor(w * wordDuration * sampleRate);
    const wordEndSample = Math.floor((w + 0.85) * wordDuration * sampleRate);

    // Dynamic pitch intonation
    const baseF0 = 130 + Math.sin((w / words.length) * Math.PI) * 25;

    for (let i = wordStartSample; i < wordEndSample && i < numSamples; i++) {
      const t = (i - wordStartSample) / sampleRate;
      const progress = (i - wordStartSample) / (wordEndSample - wordStartSample);
      // Envelope attack & release
      const envelope = Math.sin(progress * Math.PI);

      // Vocal harmonics
      const f0 = Math.sin(2 * Math.PI * baseF0 * t);
      const f1 = 0.5 * Math.sin(2 * Math.PI * (baseF0 * 2) * t);
      const f2 = 0.25 * Math.sin(2 * Math.PI * (baseF0 * 4) * t);
      const f3 = 0.15 * Math.sin(2 * Math.PI * 1800 * t);
      const consonantBurst = (Math.random() * 2 - 1) * (progress < 0.1 ? 0.2 : 0.03);

      samples[i] = (f0 + f1 + f2 + f3 + consonantBurst) * 0.45 * envelope;
    }
  }

  const blob = encodeWavBlob(samples, sampleRate);
  return new File([blob], `${preset.id}.wav`, { type: "audio/wav" });
}

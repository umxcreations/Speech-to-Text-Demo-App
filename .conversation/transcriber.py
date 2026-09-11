import logging
import os
from typing import Any, Dict, List, Union

import torch
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Transcriber")


class SpeechTranscriber:
    def __init__(self, model_size: str = None):
        self.model_size = model_size or os.getenv("WHISPER_MODEL_SIZE", "base")
        if torch.cuda.is_available():
            self.device = "cuda"
            self.compute_type = "float16"
        else:
            self.device = "cpu"
            self.compute_type = "int8"
        self.model = None
        logger.info(
            "Whisper model '%s' will load on first transcription (%s, %s).",
            self.model_size,
            self.device,
            self.compute_type,
        )

    def _ensure_model(self):
        if self.model is not None:
            return

        logger.info(
            "Loading Whisper model '%s' on device: %s (%s)...",
            self.model_size,
            self.device,
            self.compute_type,
        )
        try:
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
            )
        except Exception as exc:
            if self.model_size == "base":
                raise
            logger.exception(
                "Failed loading model '%s'; falling back to lightweight 'base'.",
                self.model_size,
            )
            self.model_size = "base"
            self.device = "cpu"
            self.compute_type = "int8"
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
            )

    def transcribe(
        self,
        audio_source: Union[str, Any],
        language: str = None,
        beam_size: int = 5,
    ) -> Dict[str, Any]:
        try:
            self._ensure_model()
            segments_generator, info = self.model.transcribe(
                audio_source,
                beam_size=beam_size,
                language=language,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                word_timestamps=True,
            )

            transcribed_texts: List[str] = []
            segment_records: List[Dict[str, Any]] = []

            for segment in segments_generator:
                text = segment.text.strip()
                transcribed_texts.append(text)

                words = []
                if segment.words:
                    for word in segment.words:
                        words.append(
                            {
                                "word": word.word,
                                "start": round(word.start, 3),
                                "end": round(word.end, 3),
                                "probability": round(word.probability, 4),
                            }
                        )

                segment_records.append(
                    {
                        "id": segment.id,
                        "start": round(segment.start, 3),
                        "end": round(segment.end, 3),
                        "text": text,
                        "words": words,
                    }
                )

            return {
                "detected_language": info.language,
                "language_probability": round(info.language_probability, 4),
                "audio_duration_seconds": round(info.duration, 2),
                "transcript": " ".join(transcribed_texts),
                "segments": segment_records,
            }
        except Exception as exc:
            logger.error("Error during audio transcription execution: %s", exc)
            raise
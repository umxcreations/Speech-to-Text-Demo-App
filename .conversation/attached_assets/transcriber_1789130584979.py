import os
import logging
import torch
from typing import Dict, Any, Union, List
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Transcriber")

class SpeechTranscriber:
    def __init__(self, model_size: str = "large-v3-turbo"):
        # Auto-detect hardware to support both Local CUDA GPU and CPU environments
        if torch.cuda.is_available():
            self.device = "cuda"
            self.compute_type = "float16"
        else:
            self.device = "cpu"
            self.compute_type = "int8"
            
        logger.info(f"Initializing Whisper model '{model_size}' on device: {self.device} ({self.compute_type})...")
        
        try:
            self.model = WhisperModel(
                model_size, 
                device=self.device, 
                compute_type=self.compute_type
            )
        except Exception as e:
            logger.error(f"Failed loading model '{model_size}' on primary hardware configuration: {e}")
            logger.info("Fallback: Loading lightweight 'base' model to fit constrained environments...")
            self.model = WhisperModel("base", device="cpu", compute_type="int8")

    def transcribe(
        self, 
        audio_source: Union[str, Any], 
        language: str = None, 
        beam_size: int = 5
    ) -> Dict[str, Any]:
        """
        Runs transcription with Silero VAD filtering and segment timestamps extraction.
        """
        try:
            segments_generator, info = self.model.transcribe(
                audio_source,
                beam_size=beam_size,
                language=language,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
                word_timestamps=True
            )

            transcribed_texts: List[str] = []
            segment_records: List[Dict[str, Any]] = []

            for segment in segments_generator:
                text = segment.text.strip()
                transcribed_texts.append(text)
                
                # Extract word-level timestamps if available
                words = []
                if segment.words:
                    for w in segment.words:
                        words.append({
                            "word": w.word,
                            "start": round(w.start, 3),
                            "end": round(w.end, 3),
                            "probability": round(w.probability, 4)
                        })

                segment_records.append({
                    "id": segment.id,
                    "start": round(segment.start, 3),
                    "end": round(segment.end, 3),
                    "text": text,
                    "words": words
                })

            full_transcript = " ".join(transcribed_texts)

            return {
                "detected_language": info.language,
                "language_probability": round(info.language_probability, 4),
                "audio_duration_seconds": round(info.duration, 2),
                "transcript": full_transcript,
                "segments": segment_records
            }

        except Exception as e:
            logger.error(f"Error during audio transcription execution: {e}")
            raise
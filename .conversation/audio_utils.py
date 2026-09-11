import logging
import subprocess

import numpy as np

logger = logging.getLogger("AudioUtils")


def process_audio_bytes(audio_bytes: bytes) -> np.ndarray:
    """Convert an audio buffer to 16 kHz mono float32 samples with FFmpeg."""
    command = [
        "ffmpeg",
        "-i",
        "pipe:0",
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        "pipe:1",
    ]

    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        output, error = process.communicate(input=audio_bytes)

        if process.returncode != 0:
            logger.error("FFmpeg process error: %s", error.decode("utf-8"))
            raise RuntimeError("FFmpeg audio decoding failed.")

        return np.frombuffer(output, np.int16).astype(np.float32) / 32768.0
    except Exception:
        logger.exception("Failed processing audio bytes in memory")
        raise
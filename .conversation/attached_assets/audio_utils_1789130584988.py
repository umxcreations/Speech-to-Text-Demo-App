import subprocess
import numpy as np
import logging

logger = logging.getLogger("AudioUtils")

def process_audio_bytes(audio_bytes: bytes) -> np.ndarray:
    """
    Converts raw binary audio buffer to 16kHz mono float32 numpy array using FFmpeg subprocess piping.
    """
    command = [
        "ffmpeg",
        "-i", "pipe:0",
        "-f", "s16le",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "pipe:1"
    ]
    
    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        out, err = process.communicate(input=audio_bytes)
        
        if process.returncode != 0:
            logger.error(f"FFmpeg process error: {err.decode('utf-8')}")
            raise RuntimeError("FFmpeg audio decoding failed.")
            
        return np.frombuffer(out, np.int16).astype(np.float32) / 32768.0

    except Exception as e:
        logger.error(f"Failed processing audio bytes in memory: {e}")
        raise
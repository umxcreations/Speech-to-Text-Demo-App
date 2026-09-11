import os
from typing import Any, Dict, Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from audio_utils import process_audio_bytes
from transcriber import SpeechTranscriber

app = FastAPI(
    title="Speech-to-Text Transcription Service",
    description="Production-ready FastAPI service using faster-whisper, Silero VAD, and FFmpeg.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

transcriber_engine = None


@app.on_event("startup")
async def startup_event():
    global transcriber_engine
    transcriber_engine = SpeechTranscriber()


class PathTranscribeRequest(BaseModel):
    file_path: str
    language: Optional[str] = None


@app.get("/health")
def health_check():
    if transcriber_engine is None:
        raise HTTPException(status_code=503, detail="Transcriber is still starting.")
    return {
        "status": "online",
        "device": transcriber_engine.device,
        "compute_type": transcriber_engine.compute_type,
        "model": transcriber_engine.model_size,
        "model_loaded": transcriber_engine.model is not None,
    }


@app.post("/transcribe")
def transcribe_file_path(payload: PathTranscribeRequest) -> Dict[str, Any]:
    if not os.path.exists(payload.file_path):
        raise HTTPException(
            status_code=400,
            detail=f"File path '{payload.file_path}' does not exist.",
        )

    try:
        return transcriber_engine.transcribe(
            audio_source=payload.file_path,
            language=payload.language,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/transcribe/stream")
async def transcribe_audio_stream(
    file: UploadFile = File(...),
    language: Optional[str] = Query(None),
) -> Dict[str, Any]:
    try:
        contents = await file.read()
        audio_array = process_audio_bytes(contents)
        return transcriber_engine.transcribe(
            audio_source=audio_array,
            language=language,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed processing binary audio stream: {exc}",
        ) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000)
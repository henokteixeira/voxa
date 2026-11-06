"""Voxa local voice service: Whisper (speech-to-text) + Kokoro (text-to-speech)."""

import io
import os
import tempfile
import time
from contextlib import asynccontextmanager

import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from engines import KOKORO_LANG, EngineError, KokoroTts, SpeechToText, TextToSpeech, WhisperStt

MAX_TTS_CHARS = 2000


class TtsRequest(BaseModel):
    text: str
    language: str = "en"


def _elapsed_ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)


def create_app(stt: SpeechToText, tts: TextToSpeech, warmup: bool = False) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if warmup:
            stt.load()
            tts.load()
        yield

    app = FastAPI(title="voxa-voice", lifespan=lifespan)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/stt")
    def transcribe(audio: UploadFile = File(...), language: str = Form("en")):
        data = audio.file.read()
        if not data:
            raise HTTPException(400, "Empty audio")
        start = time.perf_counter()
        suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
            tmp.write(data)
            tmp.flush()
            try:
                result = stt.transcribe(tmp.name, language.split("-")[0])
            except EngineError as e:
                raise HTTPException(503, str(e)) from e
        return {
            "text": result.text,
            "language": result.language,
            "audioMs": result.audio_ms,
            "processingMs": _elapsed_ms(start),
        }

    @app.post("/tts")
    def synthesize(req: TtsRequest):
        text = req.text.strip()
        if not text:
            raise HTTPException(400, "Empty text")
        if len(text) > MAX_TTS_CHARS:
            raise HTTPException(413, f"Text longer than {MAX_TTS_CHARS} characters")
        if req.language not in KOKORO_LANG:
            raise HTTPException(422, f"Unsupported language: {req.language}")
        start = time.perf_counter()
        try:
            samples, rate = tts.synthesize(text, req.language)
        except EngineError as e:
            raise HTTPException(503, str(e)) from e
        buf = io.BytesIO()
        sf.write(buf, samples, rate, format="WAV")
        return Response(
            content=buf.getvalue(),
            media_type="audio/wav",
            headers={"X-Processing-Ms": str(_elapsed_ms(start))},
        )

    return app


def _default_app() -> FastAPI:
    return create_app(
        WhisperStt(os.getenv("WHISPER_MODEL", "small"), os.getenv("WHISPER_INITIAL_PROMPT")),
        KokoroTts(os.getenv("KOKORO_VOICE", "af_heart")),
        warmup=os.getenv("VOICE_WARMUP", "0") == "1",
    )


app = _default_app()

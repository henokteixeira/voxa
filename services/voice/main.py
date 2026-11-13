"""Voxa local voice service: Whisper (speech-to-text) + Kokoro (text-to-speech)."""

import io
import logging
import os
import time
from contextlib import asynccontextmanager

import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from engines import DEFAULT_WHISPER_MODEL, KOKORO_LANG, MIXED_PROMPT, EngineError, InputError, KokoroTts, SpeechToText, TextToSpeech, WhisperStt

MAX_TTS_CHARS = 2000
MAX_AUDIO_BYTES = 25 * 1024 * 1024


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
        data = audio.file.read(MAX_AUDIO_BYTES + 1)
        if not data:
            raise HTTPException(400, "Empty audio")
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Audio larger than 25 MB")
        start = time.perf_counter()
        try:
            # In memory, not a temp file: a still-open temp file cannot be reopened on Windows.
            result = stt.transcribe(io.BytesIO(data), language.split("-")[0].lower())
        except InputError as e:
            raise HTTPException(422, str(e)) from e
        except EngineError as e:
            raise HTTPException(503, str(e)) from e
        return {
            "text": result.text,
            # Echo the caller's BCP 47 tag (e.g. en-US): records must keep the region.
            "language": language,
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


def whisper_from_env(env=os.environ) -> WhisperStt:
    """Unset WHISPER_INITIAL_PROMPT uses the mixed prompt; an empty one means no prompt.

    WHISPER_CPU_THREADS sets the threads; unset uses 4. WHISPER_NATIVE_MIN_PROBABILITY (0 to 1)
    turns on the switch to WHISPER_NATIVE_LANGUAGE (default pt); unset leaves it off.
    """
    threads = env.get("WHISPER_CPU_THREADS", "").strip()
    return WhisperStt(
        env.get("WHISPER_MODEL") or DEFAULT_WHISPER_MODEL,
        env.get("WHISPER_INITIAL_PROMPT", MIXED_PROMPT),
        cpu_threads=int(threads) if threads.isdigit() else None,
        native_language=env.get("WHISPER_NATIVE_LANGUAGE") or "pt",
        native_min_probability=_probability(env.get("WHISPER_NATIVE_MIN_PROBABILITY", "")),
    )


def _probability(value: str) -> float | None:
    """A number from 0 to 1; anything else (unset included) means off."""
    try:
        number = float(value)
    except ValueError:
        return None
    return number if 0 <= number <= 1 else None


def _default_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO)  # shows the native-language switch in the logs
    return create_app(
        whisper_from_env(),
        KokoroTts(os.getenv("KOKORO_VOICE", "af_heart")),
        warmup=os.getenv("VOICE_WARMUP", "1") == "1",
    )


app = _default_app()

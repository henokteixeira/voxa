"""Voxa local voice service: Whisper (speech-to-text) + Kokoro (text-to-speech).

Models load lazily on first use so the server starts fast.
"""

import io
import os
import tempfile
from functools import lru_cache

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
KOKORO_VOICE = os.getenv("KOKORO_VOICE", "af_heart")

# Kokoro uses its own language codes; map them from BCP 47.
KOKORO_LANG = {"en": "a", "en-US": "a", "en-GB": "b"}

app = FastAPI(title="voxa-voice")


@lru_cache(maxsize=1)
def whisper():
    from faster_whisper import WhisperModel

    return WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")


@lru_cache(maxsize=4)
def kokoro(lang_code: str):
    from kokoro import KPipeline

    return KPipeline(lang_code=lang_code)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/stt")
async def stt(audio: UploadFile = File(...), language: str = Form("en")):
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(audio.filename or "")[1]) as tmp:
        tmp.write(await audio.read())
        tmp.flush()
        segments, info = whisper().transcribe(tmp.name, language=language.split("-")[0])
        text = " ".join(s.text.strip() for s in segments)
    return {"text": text, "language": info.language}


class TtsRequest(BaseModel):
    text: str
    language: str = "en"


@app.post("/tts")
def tts(req: TtsRequest):
    import numpy as np
    import soundfile as sf

    pipeline = kokoro(KOKORO_LANG.get(req.language, "a"))
    chunks = [r.audio.numpy() for r in pipeline(req.text, voice=KOKORO_VOICE) if r.audio is not None]
    buf = io.BytesIO()
    sf.write(buf, np.concatenate(chunks), 24000, format="WAV")
    return Response(content=buf.getvalue(), media_type="audio/wav")

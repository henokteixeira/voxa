import io

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from engines import EngineError, SttResult
from main import create_app


class FakeStt:
    def __init__(self, result=None, error=None):
        self.result = result or SttResult(text="I goes to work.", language="en", audio_ms=1200)
        self.error = error
        self.calls = []
        self.loaded = False

    def transcribe(self, path, language):
        self.calls.append((path, language))
        if self.error:
            raise self.error
        return self.result

    def load(self):
        self.loaded = True


class FakeTts:
    def __init__(self, error=None):
        self.error = error
        self.calls = []
        self.loaded = False

    def synthesize(self, text, language):
        self.calls.append((text, language))
        if self.error:
            raise self.error
        return np.zeros(2400, dtype=np.float32), 24000

    def load(self):
        self.loaded = True


def client(stt=None, tts=None, warmup=False):
    return TestClient(create_app(stt or FakeStt(), tts or FakeTts(), warmup=warmup))


def post_audio(c, data=b"fake-audio", filename="turn.webm", language="en"):
    return c.post("/stt", files={"audio": (filename, data)}, data={"language": language})


# --- health ---


def test_health_is_ok():
    assert client().get("/health").json()["status"] == "ok"


def test_warmup_loads_both_engines_on_startup():
    stt, tts = FakeStt(), FakeTts()
    with TestClient(create_app(stt, tts, warmup=True)):
        pass
    assert stt.loaded and tts.loaded


def test_no_warmup_leaves_engines_lazy():
    stt, tts = FakeStt(), FakeTts()
    with TestClient(create_app(stt, tts, warmup=False)):
        pass
    assert not stt.loaded and not tts.loaded


# --- STT ---


def test_stt_returns_text_language_and_timings():
    res = post_audio(client())
    assert res.status_code == 200
    body = res.json()
    assert body["text"] == "I goes to work."
    assert body["language"] == "en"
    assert body["audioMs"] == 1200
    assert isinstance(body["processingMs"], int)


def test_stt_passes_base_language_to_engine_and_keeps_file_extension():
    stt = FakeStt()
    post_audio(client(stt=stt), filename="turn.ogg", language="en-US")
    path, language = stt.calls[0]
    assert language == "en"
    assert path.endswith(".ogg")


def test_stt_rejects_empty_audio():
    res = post_audio(client(), data=b"")
    assert res.status_code == 400


def test_stt_engine_failure_is_503():
    res = post_audio(client(stt=FakeStt(error=EngineError("model failed"))))
    assert res.status_code == 503
    assert "model failed" in res.json()["detail"]


# --- TTS ---


def test_tts_returns_wav_with_processing_header():
    tts = FakeTts()
    res = client(tts=tts).post("/tts", json={"text": "Hello there.", "language": "en-GB"})
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert int(res.headers["x-processing-ms"]) >= 0
    audio, rate = sf.read(io.BytesIO(res.content))
    assert rate == 24000 and len(audio) == 2400
    assert tts.calls == [("Hello there.", "en-GB")]


def test_tts_rejects_blank_text():
    res = client().post("/tts", json={"text": "   ", "language": "en"})
    assert res.status_code == 400


def test_tts_rejects_too_long_text():
    res = client().post("/tts", json={"text": "a" * 2001, "language": "en"})
    assert res.status_code == 413


def test_tts_rejects_unsupported_language():
    res = client().post("/tts", json={"text": "Bonjour", "language": "fr"})
    assert res.status_code == 422


def test_tts_engine_failure_is_503():
    res = client(tts=FakeTts(error=EngineError("no voice"))).post("/tts", json={"text": "Hi", "language": "en"})
    assert res.status_code == 503

"""Speech engines behind small interfaces, so the HTTP layer can be tested without models.

Models load lazily on first use (or at startup when warmup is on).
"""

from dataclasses import dataclass
from functools import cached_property
from typing import Protocol

import numpy as np

# Kokoro uses its own language codes; map them from BCP 47.
# Only English is wired for now: other Kokoro languages also need their own voice.
KOKORO_LANG = {"en": "a", "en-US": "a", "en-GB": "b"}
KOKORO_SAMPLE_RATE = 24000


class EngineError(Exception):
    """A model failed to load or to run."""


@dataclass
class SttResult:
    text: str
    language: str
    audio_ms: int


class SpeechToText(Protocol):
    def load(self) -> None: ...
    def transcribe(self, path: str, language: str) -> SttResult: ...


class TextToSpeech(Protocol):
    def load(self) -> None: ...
    def synthesize(self, text: str, language: str) -> tuple[np.ndarray, int]: ...


class WhisperStt:
    """faster-whisper on CPU (int8).

    Decoding is kept literal on purpose: the tutor needs the learner's mistakes, not a
    cleaned-up sentence. `initial_prompt` is configurable so eval/cleanup_risk.py can
    compare variants.
    """

    def __init__(self, model: str, initial_prompt: str | None = None):
        self.model_name = model
        self.initial_prompt = initial_prompt or None

    @cached_property
    def model(self):
        try:
            from faster_whisper import WhisperModel

            return WhisperModel(self.model_name, device="cpu", compute_type="int8")
        except Exception as e:  # import, download or load failure
            raise EngineError(f"Whisper failed to load: {e}") from e

    def load(self) -> None:
        self.model  # noqa: B018 — triggers the lazy load

    def transcribe(self, path: str, language: str) -> SttResult:
        try:
            segments, info = self.model.transcribe(
                path,
                language=language,
                temperature=0.0,
                condition_on_previous_text=False,
                initial_prompt=self.initial_prompt,
            )
            text = " ".join(s.text.strip() for s in segments).strip()
        except EngineError:
            raise
        except Exception as e:
            raise EngineError(f"Whisper failed: {e}") from e
        return SttResult(text=text, language=info.language, audio_ms=round(info.duration * 1000))


class KokoroTts:
    def __init__(self, voice: str):
        self.voice = voice
        self._pipelines: dict[str, object] = {}

    def _pipeline(self, lang_code: str):
        if lang_code not in self._pipelines:
            try:
                from kokoro import KPipeline

                self._pipelines[lang_code] = KPipeline(lang_code=lang_code)
            except Exception as e:
                raise EngineError(f"Kokoro failed to load: {e}") from e
        return self._pipelines[lang_code]

    def load(self) -> None:
        self._pipeline("a")

    def synthesize(self, text: str, language: str) -> tuple[np.ndarray, int]:
        pipeline = self._pipeline(KOKORO_LANG[language])
        try:
            chunks = [r.audio.numpy() for r in pipeline(text, voice=self.voice) if r.audio is not None]
        except Exception as e:
            raise EngineError(f"Kokoro failed: {e}") from e
        if not chunks:
            raise EngineError("Kokoro returned no audio")
        return np.concatenate(chunks), KOKORO_SAMPLE_RATE

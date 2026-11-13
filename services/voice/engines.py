"""Speech engines behind small interfaces, so the HTTP layer can be tested without models.

Models load lazily on first use (or at startup when warmup is on).
"""

import logging
import threading
from dataclasses import dataclass
from typing import BinaryIO, Protocol

import numpy as np

# Kokoro uses its own language codes; map them from BCP 47.
# Only English is wired for now: other Kokoro languages also need their own voice.
KOKORO_LANG = {"en": "a", "en-US": "a", "en-GB": "b"}
KOKORO_SAMPLE_RATE = 24000

# Default Whisper prompt: mixing in Portuguese words keeps the ones a learner says when stuck
# ("The prazo is Friday") instead of swapping them for English ("deadline"). Chosen with
# eval/mixed_language.py on a real voice (medium: 9 of 10 kept, against 6 without it).
# The words differ from the eval cases, so the eval stays fair.
MIXED_PROMPT = "So, the planilha is ready and the diretoria wants to see it before the culto."
DEFAULT_WHISPER_MODEL = "medium"

# Greedy first, so the learner's mistakes survive. The hotter retries run only when a window
# compresses too well, which is Whisper stuck repeating a word ("some some some ...").
GREEDY_THEN_FALLBACK = (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
LOOP_COMPRESSION_RATIO = 2.4


logger = logging.getLogger("voxa.voice")


class EngineError(Exception):
    """A model failed to load or to run."""


class InputError(Exception):
    """The request itself is bad: undecodable audio or a language the model does not know."""


_NO_PROMPT = object()


@dataclass
class SttResult:
    text: str
    language: str
    audio_ms: int


class SpeechToText(Protocol):
    def load(self) -> None: ...
    def transcribe(self, audio: BinaryIO, language: str) -> SttResult: ...


class TextToSpeech(Protocol):
    def load(self) -> None: ...
    def synthesize(self, text: str, language: str) -> tuple[np.ndarray, int]: ...


class WhisperStt:
    """faster-whisper on CPU (int8).

    Decoding is kept literal on purpose: the tutor needs the learner's mistakes, not a
    cleaned-up sentence. `initial_prompt` is configurable so eval/cleanup_risk.py can
    compare variants.
    """

    def __init__(
        self,
        model: str,
        initial_prompt: str | None = None,
        cpu_threads: int | None = None,
        native_language: str = "pt",
        native_min_probability: float | None = None,
    ):
        self.model_name = model
        self.cpu_threads = cpu_threads or 4
        self.initial_prompt = (initial_prompt or "").strip() or None
        # A whole turn said in the learner's own language, with the language pinned to English,
        # comes out translated. When Whisper is at least this sure the turn is in the native
        # language, it is transcribed in that language instead. None leaves the language pinned.
        self.native_language = native_language
        self.native_min_probability = native_min_probability
        self._model = None
        self._lock = threading.Lock()

    @property
    def model(self):
        with self._lock:  # concurrent first requests must not load the model twice
            if self._model is None:
                try:
                    from faster_whisper import WhisperModel

                    self._model = WhisperModel(
                        self.model_name, device="cpu", compute_type="int8", cpu_threads=self.cpu_threads
                    )
                except Exception as e:  # import, download or load failure
                    raise EngineError(f"Whisper failed to load: {e}") from e
            return self._model

    def load(self) -> None:
        self.model  # noqa: B018 — triggers the lazy load

    def transcribe(self, audio: BinaryIO, language: str, initial_prompt=_NO_PROMPT) -> SttResult:
        prompt = self.initial_prompt if initial_prompt is _NO_PROMPT else initial_prompt
        model = self.model
        try:
            if self._may_switch(language):
                audio = _decode(audio)  # decoded once, for detection and transcription
                probability = self.native_probability(audio)
                switch = probability >= self.native_min_probability
                logger.info("stt %s probability=%.2f switched=%s", self.native_language, probability, switch)
                if switch:
                    # The mixed prompt is English; it would pull the Portuguese back to English.
                    language, prompt = self.native_language, None
            segments, info = model.transcribe(
                audio,
                language=language,
                temperature=GREEDY_THEN_FALLBACK,
                compression_ratio_threshold=LOOP_COMPRESSION_RATIO,
                condition_on_previous_text=False,
                initial_prompt=prompt,
            )
            text = " ".join(s.text.strip() for s in segments).strip()
        except Exception as e:
            if _is_input_error(e):
                raise InputError(f"Bad audio or language: {e}") from e
            raise EngineError(f"Whisper failed: {e}") from e
        return SttResult(text=text, language=info.language, audio_ms=round(info.duration * 1000))

    def native_probability(self, audio) -> float:
        """How sure Whisper is that the audio is in the native language (0 to 1)."""
        _, _, probabilities = self.model.detect_language(audio=_decode(audio))
        return dict(probabilities).get(self.native_language, 0.0)

    def _may_switch(self, language: str) -> bool:
        return self.native_min_probability is not None and language != self.native_language


def _decode(audio):
    if isinstance(audio, np.ndarray):
        return audio
    from faster_whisper import decode_audio

    return decode_audio(audio)


def _is_input_error(e: Exception) -> bool:
    # faster-whisper raises ValueError for an unknown language; PyAV (av.*) errors mean
    # the audio could not be decoded.
    return isinstance(e, ValueError) or type(e).__module__.startswith("av")


class KokoroTts:
    def __init__(self, voice: str):
        self.voice = voice
        self._pipelines: dict[str, object] = {}
        self._lock = threading.Lock()

    def _pipeline(self, lang_code: str):
        with self._lock:
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

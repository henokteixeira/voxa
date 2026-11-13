from types import SimpleNamespace

import numpy as np
import pytest

from engines import EngineError, InputError, WhisperStt


class FakeWhisperModel:
    def __init__(self, error=None, pt_probability=0.0):
        self.kwargs = None
        self.error = error
        self.pt_probability = pt_probability
        self.detected = 0

    def detect_language(self, audio):
        self.detected += 1
        rest = 1 - self.pt_probability
        return "en", rest, [("en", rest), ("pt", self.pt_probability)]

    def transcribe(self, audio, **kwargs):
        if self.error:
            raise self.error
        self.kwargs = kwargs
        segments = [SimpleNamespace(text=" I goes "), SimpleNamespace(text=" to work. ")]
        return iter(segments), SimpleNamespace(language="en", duration=1.25)


def stt_with(model, prompt=None, native_min=None):
    stt = WhisperStt("small", prompt, native_min_probability=native_min)
    stt._model = model  # skip the real (lazy) model load
    return stt


def test_whisper_joins_segments_and_reports_duration():
    result = stt_with(FakeWhisperModel()).transcribe("a.wav", "en")
    assert result.text == "I goes to work."
    assert result.language == "en"
    assert result.audio_ms == 1250


def test_whisper_decodes_literally_with_pinned_language():
    model = FakeWhisperModel()
    stt_with(model).transcribe("a.wav", "en")
    assert model.kwargs["language"] == "en"
    assert model.kwargs["temperature"][0] == 0.0
    assert model.kwargs["condition_on_previous_text"] is False
    assert model.kwargs["initial_prompt"] is None


def test_whisper_retries_hotter_when_greedy_decoding_loops():
    model = FakeWhisperModel()
    stt_with(model).transcribe("a.wav", "en")
    assert model.kwargs["temperature"] == (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
    assert model.kwargs["compression_ratio_threshold"] == 2.4


def test_whisper_uses_configured_initial_prompt():
    model = FakeWhisperModel()
    stt_with(model, "Um, so, I goes there.").transcribe("a.wav", "en")
    assert model.kwargs["initial_prompt"] == "Um, so, I goes there."


def test_whisper_runtime_failure_becomes_engine_error():
    with pytest.raises(EngineError):
        stt_with(FakeWhisperModel(error=RuntimeError("boom"))).transcribe("a.wav", "en")


def test_whisper_prompt_can_be_overridden_per_call():
    model = FakeWhisperModel()
    stt_with(model, "configured").transcribe("a.wav", "en", initial_prompt=None)
    assert model.kwargs["initial_prompt"] is None


def test_whisper_unknown_language_becomes_input_error():
    with pytest.raises(InputError):
        stt_with(FakeWhisperModel(error=ValueError("'xx' is not a valid language code"))).transcribe("a.wav", "xx")


def test_whisper_from_env_defaults_to_medium_with_the_mixed_prompt():
    from engines import MIXED_PROMPT
    from main import whisper_from_env

    stt = whisper_from_env({})
    assert (stt.model_name, stt.initial_prompt) == ("medium", MIXED_PROMPT)


def test_whisper_from_env_empty_prompt_means_none():
    from main import whisper_from_env

    stt = whisper_from_env({"WHISPER_MODEL": "small", "WHISPER_INITIAL_PROMPT": " "})
    assert (stt.model_name, stt.initial_prompt) == ("small", None)


def test_whisper_decodes_with_four_threads_unless_set(monkeypatch):
    from main import whisper_from_env

    monkeypatch.setattr("os.cpu_count", lambda: 12)
    assert whisper_from_env({}).cpu_threads == 4
    assert whisper_from_env({"WHISPER_CPU_THREADS": "6"}).cpu_threads == 6
    assert whisper_from_env({"WHISPER_CPU_THREADS": "lots"}).cpu_threads == 4


AUDIO = np.zeros(16000, dtype=np.float32)


def test_whisper_transcribes_in_portuguese_when_sure_the_turn_is_portuguese():
    model = FakeWhisperModel(pt_probability=0.95)
    stt_with(model, "So, the planilha is ready.", native_min=0.9).transcribe(AUDIO, "en")
    assert model.kwargs["language"] == "pt"
    assert model.kwargs["initial_prompt"] is None  # the English prompt would pull it back


def test_whisper_keeps_english_when_not_sure_enough():
    model = FakeWhisperModel(pt_probability=0.6)
    stt_with(model, "So, the planilha is ready.", native_min=0.9).transcribe(AUDIO, "en")
    assert model.kwargs["language"] == "en"
    assert model.kwargs["initial_prompt"] == "So, the planilha is ready."


def test_whisper_skips_detection_when_the_switch_is_off():
    model = FakeWhisperModel(pt_probability=1.0)
    stt_with(model).transcribe("a.wav", "en")
    assert (model.detected, model.kwargs["language"]) == (0, "en")


def test_whisper_from_env_reads_the_native_language_switch():
    from main import whisper_from_env

    assert whisper_from_env({}).native_min_probability is None
    stt = whisper_from_env({"WHISPER_NATIVE_MIN_PROBABILITY": "0.8", "WHISPER_NATIVE_LANGUAGE": "es"})
    assert (stt.native_min_probability, stt.native_language) == (0.8, "es")
    assert whisper_from_env({"WHISPER_NATIVE_MIN_PROBABILITY": "high"}).native_min_probability is None
    assert whisper_from_env({"WHISPER_NATIVE_MIN_PROBABILITY": "2"}).native_min_probability is None

from types import SimpleNamespace

import pytest

from engines import EngineError, InputError, WhisperStt


class FakeWhisperModel:
    def __init__(self, error=None):
        self.kwargs = None
        self.error = error

    def transcribe(self, audio, **kwargs):
        if self.error:
            raise self.error
        self.kwargs = kwargs
        segments = [SimpleNamespace(text=" I goes "), SimpleNamespace(text=" to work. ")]
        return iter(segments), SimpleNamespace(language="en", duration=1.25)


def stt_with(model, prompt=None):
    stt = WhisperStt("small", prompt)
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
    assert model.kwargs["temperature"] == 0.0
    assert model.kwargs["condition_on_previous_text"] is False
    assert model.kwargs["initial_prompt"] is None


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

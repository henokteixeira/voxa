# voice — local voice service

Whisper (via faster-whisper) for speech-to-text and Kokoro for text-to-speech. Runs on CPU.

```bash
cd services/voice
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8001
```

Both models load at startup (the first run downloads them: Whisper `small` ~470 MB, Kokoro ~300 MB),
so the server answers only once they are ready. `VOICE_WARMUP=0` loads them lazily instead, but then
the first request can exceed the API's timeout. Kokoro may also need `espeak-ng` installed on the system.

## Endpoints

| Endpoint | Input | Output |
| --- | --- | --- |
| `GET /health` | | `{ "status": "ok" }` |
| `POST /stt` | multipart: `audio` (file, up to 25 MB, any format ffmpeg reads), `language` (BCP 47, default `en`) | `{ text, language, audioMs, processingMs }` (`language` echoes the request) |
| `POST /tts` | JSON: `{ text, language }` (`en`, `en-US`, `en-GB`; up to 2000 characters) | WAV audio, `X-Processing-Ms` header |

Errors: `400` empty audio or text, `413` audio or text too large, `422` undecodable audio or unsupported language, `503` model failed.

## Configuration

Read from the process environment (the root `.env` is not loaded here; export them or prefix the command).

| Variable | Default | Meaning |
| --- | --- | --- |
| `WHISPER_MODEL` | `small` | Whisper size (`base`, `small`, `medium`, ...) |
| `WHISPER_INITIAL_PROMPT` | none | Prompt that biases the transcription style (see the clean-up test) |
| `KOKORO_VOICE` | `af_heart` | Kokoro voice |
| `VOICE_WARMUP` | `1` | `0` loads the models on first use instead of at startup |

Whisper decodes literally on purpose (temperature 0, no conditioning on previous text): the tutor
needs the learner's mistakes, not a cleaned-up sentence.

## Evaluation (run on your PC)

```bash
pip install -r requirements-eval.txt
python -m eval.record                                    # optional: record yourself saying the 20 test sentences
python -m eval.cleanup_risk --models small medium --out eval/results/cleanup.md
uvicorn main:app --port 8001 &                           # then, with the service running:
python -m eval.latency --runs 5 --out eval/results/latency.md
python -m eval.record --mixed                            # record 10 English sentences with Portuguese words
python -m eval.mixed_language --models small medium --out eval/results/mixed.md
```

- **Clean-up risk:** checks whether Whisper keeps 20 typical mistakes ("He don't have access") or
  silently fixes them. Uses your recordings in `eval/recordings/` when present, else Kokoro speech
  (cleaner than a real voice, so your recordings are the real test). Compares each model with and
  without a "verbatim" prompt.
- **Portuguese words:** checks whether Whisper keeps the Portuguese words a learner says when stuck
  ("The prazo is Friday") or swaps them for English ("deadline"). Compares forced English (today),
  forced English with a mixed prompt, and language detection. Needs your own recordings.
- **Latency:** STT and TTS times (p50/p95) for a short, medium and long tutor line. Claude's time is
  not included, nor the browser's webm/opus encoding and the API hop; D4 measures the full loop.

Recordings and results stay out of git.

## Tests

```bash
pip install fastapi python-multipart httpx pytest numpy soundfile
pytest -q
```

Tests use fake engines, so they need no models.

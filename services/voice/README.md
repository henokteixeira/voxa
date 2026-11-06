# voice — local voice service

Whisper (via faster-whisper) for speech-to-text and Kokoro for text-to-speech. Runs on CPU.

```bash
cd services/voice
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8001
```

Models download on the first `/stt` and `/tts` calls (Whisper `small` ~470 MB; Kokoro ~300 MB),
or at startup with `VOICE_WARMUP=1`. Kokoro may also need `espeak-ng` installed on the system.

## Endpoints

| Endpoint | Input | Output |
| --- | --- | --- |
| `GET /health` | | `{ "status": "ok" }` |
| `POST /stt` | multipart: `audio` (file; extension tells the format), `language` (BCP 47, default `en`) | `{ text, language, audioMs, processingMs }` |
| `POST /tts` | JSON: `{ text, language }` (`en`, `en-US`, `en-GB`; up to 2000 characters) | WAV audio, `X-Processing-Ms` header |

Errors: `400` empty audio or text, `413` text too long, `422` unsupported language, `503` model failed.

## Configuration

Read from the process environment (the root `.env` is not loaded here; export them or prefix the command).

| Variable | Default | Meaning |
| --- | --- | --- |
| `WHISPER_MODEL` | `small` | Whisper size (`base`, `small`, `medium`, ...) |
| `WHISPER_INITIAL_PROMPT` | none | Prompt that biases the transcription style (see the clean-up test) |
| `KOKORO_VOICE` | `af_heart` | Kokoro voice |
| `VOICE_WARMUP` | `0` | `1` loads both models at startup |

Whisper decodes literally on purpose (temperature 0, no conditioning on previous text): the tutor
needs the learner's mistakes, not a cleaned-up sentence.

## Evaluation (run on your PC)

```bash
pip install -r requirements-eval.txt
python -m eval.record                                    # optional: record yourself saying the 20 test sentences
python -m eval.cleanup_risk --models small medium --out eval/results/cleanup.md
uvicorn main:app --port 8001 &                           # then, with the service running:
python -m eval.latency --runs 5 --out eval/results/latency.md
```

- **Clean-up risk:** checks whether Whisper keeps 20 typical mistakes ("He don't have access") or
  silently fixes them. Uses your recordings in `eval/recordings/` when present, else Kokoro speech
  (cleaner than a real voice, so your recordings are the real test). Compares each model with and
  without a "verbatim" prompt.
- **Latency:** STT and TTS times (p50/p95) for a short, medium and long tutor line. Claude's time is
  not included.

Recordings and results stay out of git.

## Tests

```bash
pip install fastapi python-multipart httpx pytest numpy soundfile
pytest -q
```

Tests use fake engines, so they need no models.

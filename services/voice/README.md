# voice — local voice service

Whisper (via faster-whisper) for speech-to-text and Kokoro for text-to-speech. Runs on CPU.

```bash
cd services/voice
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8001
```

Both models load at startup (the first run downloads them: Whisper `medium` ~1.5 GB, Kokoro ~300 MB),
so the server answers only once they are ready. `VOICE_WARMUP=0` loads them lazily instead, but then
the first request can exceed the API's timeout. Kokoro may also need `espeak-ng` installed on the system.

## Dependencies

`requirements.txt` lists what the service needs; `requirements.lock` pins every package the Docker image
installs, so each build gets the same versions. PyTorch is left out of the lock: the image installs the
CPU-only build first (`torch==` in the `Dockerfile`), and the lock leaves out the CUDA packages the default
Linux wheel would pull. After changing `requirements.txt`, regenerate the lock (with [uv](https://docs.astral.sh/uv/))
and keep the `torch==` version in the `Dockerfile` equal to the one uv resolves:

```bash
uv pip compile requirements.txt --python-version 3.12 --python-platform x86_64-manylinux_2_28 \
  --no-emit-package torch --no-emit-package triton \
  $(uv pip compile requirements.txt --python-version 3.12 --python-platform x86_64-manylinux_2_28 -q 2>/dev/null \
    | grep -oE '^(nvidia-[a-z0-9-]+|cuda-[a-z-]+)' | sed 's/^/--no-emit-package /') \
  --custom-compile-command "uv pip compile requirements.txt (see the README)" -o requirements.lock
```

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
| `WHISPER_MODEL` | `medium` | Whisper size (`base`, `small`, `medium`, ...). `small` is faster but mishears more Portuguese words |
| `WHISPER_INITIAL_PROMPT` | a sentence with Portuguese words | Prompt that biases the transcription style. The default keeps Portuguese words as said (see the Portuguese words test); set it empty for none |
| `WHISPER_NATIVE_MIN_PROBABILITY` | unset (off) | A turn said wholly in Portuguese comes out translated while the language is pinned to English. When Whisper is at least this sure (0 to 1) the turn is Portuguese, it transcribes it in Portuguese, without the mixed prompt. Set it from the language switch test below |
| `WHISPER_NATIVE_LANGUAGE` | `pt` | The learner's own language for that switch |
| `WHISPER_CPU_THREADS` | 4 | Threads Whisper decodes with. More is not faster: on a 12-core Mac, 10 threads took four times as long as 4 |
| `KOKORO_VOICE` | `af_heart` | Kokoro voice |
| `VOICE_WARMUP` | `1` | `0` loads the models on first use instead of at startup |

Whisper decodes literally on purpose (temperature 0, no conditioning on previous text): the tutor
needs the learner's mistakes, not a cleaned-up sentence. Only a window that loops on a repeated word
is decoded again at a higher temperature.

## Evaluation (run on your PC)

```bash
pip install -r requirements-eval.txt
python -m eval.record                                    # optional: record yourself saying the 20 test sentences
python -m eval.cleanup_risk --models small medium --out eval/results/cleanup.md
uvicorn main:app --port 8001 &                           # then, with the service running:
python -m eval.latency --runs 5 --out eval/results/latency.md
python -m eval.record --mixed                            # record 10 English sentences with Portuguese words
python -m eval.mixed_language --models small medium --out eval/results/mixed.md
python -m eval.record --portuguese                       # record 10 whole turns in Portuguese
python -m eval.language_switch --models medium --out eval/results/language.md
```

- **Clean-up risk:** checks whether Whisper keeps 20 typical mistakes ("He don't have access") or
  silently fixes them. Uses your recordings in `eval/recordings/` when present, else Kokoro speech
  (cleaner than a real voice, so your recordings are the real test). Compares each model with and
  without a "verbatim" prompt.
- **Portuguese words:** checks whether Whisper keeps the Portuguese words a learner says when stuck
  ("The prazo is Friday") or swaps them for English ("deadline"). Compares forced English, forced
  English with the mixed prompt (the service default), and language detection. Needs your own recordings.
- **Language switch:** Whisper's probability that each recorded turn is Portuguese, for the whole
  Portuguese turns, the mixed sentences and (if recorded) the plain English ones. Suggests a
  `WHISPER_NATIVE_MIN_PROBABILITY` between the groups, or says they overlap. File names do not matter
  here, so any recorder works (say, `.m4a` voice memos dropped into `eval/recordings/portuguese/`).
- **Latency:** STT and TTS times (p50/p95) for a short, medium and long tutor line. Claude's time is
  not included, nor the browser's webm/opus encoding and the API hop; D4 measures the full loop.
- **Full turn:** the API logs one line per turn, from the moment the API has the learner's speech to the
  tutor's voice being ready: `turn timing stt=2500ms tutor=4000ms tts=800ms total=7300ms` (`stt=-` for a
  typed turn: leave those out of a voice baseline; `tutor` includes Claude and the database). Read them with `docker compose logs api | grep "turn timing"`.
- **Tutor cost:** the API also logs the tokens of each Claude call:
  `tutor usage call=tutor_turn input=120 cache_read=3000 cache_write=400 output=250`.
  Read them with `docker compose logs api | grep "tutor usage"`.

Recordings and results stay out of git.

## Tests

```bash
pip install fastapi python-multipart httpx pytest numpy soundfile
pytest -q
```

Tests use fake engines, so they need no models.

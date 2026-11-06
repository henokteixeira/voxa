# voice — local voice service

Whisper (via faster-whisper) for speech-to-text and Kokoro for text-to-speech. Runs on CPU.

```bash
cd services/voice
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8001
```

Models download on the first `/stt` and `/tts` calls (Whisper `small` ~470 MB; Kokoro ~300 MB).
Kokoro may also need `espeak-ng` installed on the system for some pronunciations.

Optional variables: `WHISPER_MODEL` (default `small`), `KOKORO_VOICE` (default `af_heart`).

# voice — serviço de voz local

Whisper (via faster-whisper) para escuta e Kokoro para fala. Roda na CPU.

```bash
cd services/voice
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8001
```

Na primeira chamada de `/stt` e `/tts` os modelos são baixados (Whisper `small` ~470 MB; Kokoro ~300 MB).
O Kokoro também precisa do `espeak-ng` instalado no sistema para alguns casos de pronúncia.

Variáveis opcionais: `WHISPER_MODEL` (padrão `small`), `KOKORO_VOICE` (padrão `af_heart`).

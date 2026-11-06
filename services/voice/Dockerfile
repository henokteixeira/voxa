# Kokoro needs Python >=3.10,<3.13.
FROM python:3.12-slim
# espeak-ng: Kokoro's fallback for words it cannot pronounce.
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
# CPU-only PyTorch first: the default Linux wheel bundles CUDA (several GB).
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
# av<14: newer PyAV breaks faster-whisper (unexpected "metadata_errors" argument).
RUN pip install --no-cache-dir -r requirements.txt "av<14"
COPY . .
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]

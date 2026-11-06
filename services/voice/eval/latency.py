"""Measure the voice part of a turn against the running service (uvicorn main:app).

It synthesizes a short, a medium and a long tutor line (TTS), transcribes each result
back (STT) and reports p50/p95 over several runs, after one warm-up run that loads the
models. Claude's time is not included.

    python -m eval.latency --runs 5 --out eval/results/latency.md
"""

import argparse
import time
from pathlib import Path

import httpx

from eval.scoring import percentile

LINES = {
    "short": "Sounds good. What did you work on yesterday?",
    "medium": "Thanks for the update. Can you tell me what is blocking the release, "
    "and who you need help from to unblock it this week?",
    "long": "That makes sense. Before we move on, I would like to understand the decision "
    "behind the new offline mode. What problem were the teams in the field facing, how "
    "did you validate the idea with them, and what would you do differently next time?",
}


def run_once(client: httpx.Client, text: str) -> dict:
    start = time.perf_counter()
    tts = client.post("/tts", json={"text": text, "language": "en-US"})
    tts.raise_for_status()
    tts_ms = (time.perf_counter() - start) * 1000

    start = time.perf_counter()
    stt = client.post("/stt", files={"audio": ("turn.wav", tts.content)}, data={"language": "en"})
    stt.raise_for_status()
    stt_ms = (time.perf_counter() - start) * 1000
    body = stt.json()
    return {"tts": tts_ms, "stt": stt_ms, "audio": body["audioMs"]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8001")
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    lines = [
        "# Voice latency",
        "",
        f"{args.runs} runs per line after one warm-up. Times in ms, measured by the client.",
        "",
        "| Line | Audio | TTS p50 | TTS p95 | STT p50 | STT p95 | STT+TTS p50 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    with httpx.Client(base_url=args.url, timeout=300) as client:
        run_once(client, LINES["short"])  # warm-up: loads both models
        for name, text in LINES.items():
            runs = [run_once(client, text) for _ in range(args.runs)]
            tts, stt = [r["tts"] for r in runs], [r["stt"] for r in runs]
            total = [r["tts"] + r["stt"] for r in runs]
            lines.append(
                f"| {name} | {runs[0]['audio']} | {percentile(tts, 50):.0f} | {percentile(tts, 95):.0f} "
                f"| {percentile(stt, 50):.0f} | {percentile(stt, 95):.0f} | {percentile(total, 50):.0f} |"
            )
            print(lines[-1])
    report = "\n".join(lines) + "\n"
    print("\n" + report)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report)


if __name__ == "__main__":
    main()

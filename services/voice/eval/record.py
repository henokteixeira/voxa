"""Record yourself saying each eval sentence (mistakes included) into eval/recordings/.

    pip install -r requirements-eval.txt
    python -m eval.record            # all sentences; existing ones are skipped
    python -m eval.record --redo     # record everything again
    python -m eval.record --mixed    # the English sentences with Portuguese words (eval/mixed_cases.py)
    python -m eval.record --portuguese  # whole turns in Portuguese (eval/portuguese_cases.py)

Say the sentence exactly as written, mistakes included, at your normal meeting pace.
"""

import argparse

import numpy as np
import soundfile as sf

from eval.cases import CASES
from eval.cleanup_risk import RECORDINGS
from eval.mixed_cases import MIXED_CASES
from eval.portuguese_cases import PORTUGUESE_CASES


def record_until_enter() -> tuple[np.ndarray, int]:
    import sounddevice as sd

    # The device's own rate: many microphones reject a fixed 16 kHz.
    rate = int(sd.query_devices(kind="input")["default_samplerate"])
    chunks = []
    with sd.InputStream(samplerate=rate, channels=1, callback=lambda data, *_: chunks.append(data.copy())):
        input("  recording... press Enter to stop ")
    return (np.concatenate(chunks) if chunks else np.zeros((0, 1))), rate


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--redo", action="store_true")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--mixed", action="store_true", help="record the sentences with Portuguese words")
    group.add_argument("--portuguese", action="store_true", help="record the whole turns in Portuguese")
    args = parser.parse_args()
    if args.mixed:
        cases, folder = MIXED_CASES, RECORDINGS / "mixed"
    elif args.portuguese:
        cases, folder = PORTUGUESE_CASES, RECORDINGS / "portuguese"
    else:
        cases, folder = CASES, RECORDINGS
    folder.mkdir(parents=True, exist_ok=True)

    for i, case in enumerate(cases, 1):
        path = folder / f"{case.id}.wav"
        if path.exists() and not args.redo:
            continue
        print(f'\n[{i}/{len(cases)}] Say: "{case.text}"')
        while True:
            input("  press Enter to start ")
            samples, rate = record_until_enter()
            if len(samples) >= rate // 2:
                break
            print("  too short (under half a second), try again")
        sf.write(path, samples, rate)
        print(f"  saved {path.name}")


if __name__ == "__main__":
    main()

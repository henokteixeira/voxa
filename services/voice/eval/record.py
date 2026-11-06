"""Record yourself saying each eval sentence (mistakes included) into eval/recordings/.

    pip install -r requirements-eval.txt
    python -m eval.record            # all sentences; existing ones are skipped
    python -m eval.record --redo     # record everything again

Say the sentence exactly as written, mistakes included, at your normal meeting pace.
"""

import argparse

import numpy as np
import soundfile as sf

from eval.cases import CASES
from eval.cleanup_risk import RECORDINGS

RATE = 16000


def record_until_enter():
    import sounddevice as sd

    chunks = []
    with sd.InputStream(samplerate=RATE, channels=1, callback=lambda data, *_: chunks.append(data.copy())):
        input("  recording... press Enter to stop ")
    return np.concatenate(chunks) if chunks else np.zeros((0, 1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--redo", action="store_true")
    args = parser.parse_args()
    RECORDINGS.mkdir(parents=True, exist_ok=True)

    for i, case in enumerate(CASES, 1):
        path = RECORDINGS / f"{case.id}.wav"
        if path.exists() and not args.redo:
            continue
        print(f'\n[{i}/{len(CASES)}] Say: "{case.text}"')
        input("  press Enter to start ")
        sf.write(path, record_until_enter(), RATE)
        print(f"  saved {path.name}")


if __name__ == "__main__":
    main()

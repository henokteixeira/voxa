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
    args = parser.parse_args()
    RECORDINGS.mkdir(parents=True, exist_ok=True)

    for i, case in enumerate(CASES, 1):
        path = RECORDINGS / f"{case.id}.wav"
        if path.exists() and not args.redo:
            continue
        print(f'\n[{i}/{len(CASES)}] Say: "{case.text}"')
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

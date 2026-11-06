"""Does Whisper "clean up" the learner's mistakes? (PRD open question)

For each case in eval/cases.py it transcribes an audio clip and checks whether the
mistake survived. Clips come from eval/recordings/<id>.wav when you recorded them
(python -m eval.record), otherwise they are synthesized with Kokoro. Your own voice is
the real test: synthetic speech is clean and may hide the risk.

Each Whisper variant (model size x initial prompt) is compared side by side.

    python -m eval.cleanup_risk --models small medium --out eval/results/cleanup.md
"""

import argparse
import tempfile
from pathlib import Path

import soundfile as sf

from engines import EngineError, InputError, KokoroTts, WhisperStt
from eval.cases import CASES
from eval.scoring import score, summarize

RECORDINGS = Path(__file__).parent / "recordings"
# A disfluent, ungrammatical prompt nudges Whisper towards a verbatim style (to be measured).
VERBATIM_PROMPT = "Um, so, yesterday I go to the meeting and, uh, he don't know it."
PROMPTS = {"none": None, "verbatim": VERBATIM_PROMPT}


def clip_for(case, tts: KokoroTts, tmp: Path) -> tuple[Path, str]:
    for ext in ("wav", "webm", "ogg", "m4a"):
        recorded = RECORDINGS / f"{case.id}.{ext}"
        if recorded.exists():
            return recorded, "you"
    path = tmp / f"{case.id}.wav"
    samples, rate = tts.synthesize(case.text, "en-US")
    sf.write(path, samples, rate)
    return path, "kokoro"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--models", nargs="+", default=["small"], help="Whisper sizes, e.g. small medium")
    parser.add_argument("--voice", default="af_heart", help="Kokoro voice for synthetic clips")
    parser.add_argument("--out", type=Path, help="also write the Markdown report here")
    args = parser.parse_args()

    tts = KokoroTts(args.voice)
    models = {m: WhisperStt(m) for m in args.models}  # one model per size, shared by prompts
    variants = {f"{m}/{p}": (models[m], prompt) for m in args.models for p, prompt in PROMPTS.items()}
    rows, outcomes = [], {name: [] for name in variants}

    with tempfile.TemporaryDirectory() as tmp:
        for case in CASES:
            clip, source = clip_for(case, tts, Path(tmp))
            cells = []
            for name, (stt, prompt) in variants.items():
                try:
                    with open(clip, "rb") as audio:
                        text = stt.transcribe(audio, "en", initial_prompt=prompt).text
                except (EngineError, InputError) as e:
                    print(f"[{name}] {case.id}: error | {e}")
                    cells.append(f"error: {e}")
                    continue
                outcome = score(case, text)
                outcomes[name].append(outcome)
                cells.append(f"{outcome.value}: {text}")
                print(f"[{name}] {case.id}: {outcome.value} | {text}")
            rows.append(f"| {case.id} | {source} | {case.text} | " + " | ".join(cells) + " |")

    names = list(variants)
    lines = [
        "# Whisper clean-up risk",
        "",
        "`kept` = the mistake survived (good); `cleaned` = Whisper fixed it (risk); `other` = misheard.",
        "",
        "| Variant | Kept | Cleaned | Other | Kept rate |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name in names:
        s = summarize(outcomes[name])
        lines.append(f"| {name} | {s['kept']} | {s['cleaned']} | {s['other']} | {s['kept_rate']:.0%} |")
    lines += ["", "| Case | Voice | Said | " + " | ".join(names) + " |", "| --- " * (3 + len(names)) + "|"]
    lines += rows
    report = "\n".join(lines) + "\n"
    print("\n" + report)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report)


if __name__ == "__main__":
    main()

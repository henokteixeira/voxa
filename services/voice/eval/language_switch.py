"""How sure is Whisper that a turn is in Portuguese? Sets WHISPER_NATIVE_MIN_PROBABILITY.

A turn said wholly in Portuguese must switch to Portuguese (else it comes out translated);
an English turn, even with a few Portuguese words, must stay English. The threshold has to
sit between the two groups, measured on your own voice:

    python -m eval.record --portuguese      # whole turns in Portuguese
    python -m eval.record --mixed           # English with Portuguese words (if not recorded yet)
    python -m eval.record                   # optional: plain English sentences
    python -m eval.language_switch --models medium --out eval/results/language.md
"""

import argparse
from pathlib import Path

from engines import WhisperStt
from eval.cleanup_risk import RECORDINGS

AUDIO_EXTENSIONS = ("wav", "webm", "ogg", "m4a")
# Folder -> must the turn switch to Portuguese?
GROUPS = {"portuguese": (RECORDINGS / "portuguese", True), "mixed": (RECORDINGS / "mixed", False),
          "english": (RECORDINGS, False)}


def clips(folder: Path) -> list[Path]:
    return sorted(p for ext in AUDIO_EXTENSIONS for p in folder.glob(f"*.{ext}"))


def suggest(should_switch: list[float], should_stay: list[float]) -> str:
    """The midpoint between the two groups, or why there is none."""
    if not should_switch or not should_stay:
        return "Not enough recordings: both Portuguese turns and English ones (mixed or plain) are needed."
    low, high = min(should_switch), max(should_stay)
    if low <= high:
        return (f"The groups overlap (lowest Portuguese turn {low:.2f}, highest English one {high:.2f}): "
                "no threshold separates them on this voice.")
    return f"Suggested WHISPER_NATIVE_MIN_PROBABILITY={(low + high) / 2:.2f} (between {high:.2f} and {low:.2f})."


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--models", nargs="+", default=["medium"], help="Whisper sizes, e.g. small medium")
    parser.add_argument("--out", type=Path, help="also write the Markdown report here")
    args = parser.parse_args()

    found = {name: clips(folder) for name, (folder, _) in GROUPS.items()}
    if not found["portuguese"]:
        raise SystemExit("No Portuguese recordings. Run: python -m eval.record --portuguese")

    lines = ["# Portuguese probability per turn", "",
             "Whisper's probability that the turn is Portuguese. `portuguese` turns should be high; "
             "`mixed` and `english` ones low.", ""]
    for model in args.models:
        stt = WhisperStt(model, native_language="pt")
        switch, stay = [], []
        lines += [f"## {model}", "", "| Group | Turn | Probability |", "| --- | --- | --- |"]
        for name, (_, must_switch) in GROUPS.items():
            for clip in found[name]:
                probability = stt.native_probability(str(clip))
                (switch if must_switch else stay).append(probability)
                lines.append(f"| {name} | {clip.stem} | {probability:.2f} |")
        lines += ["", suggest(switch, stay), ""]

    report = "\n".join(lines)
    print(report)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report + "\n")


if __name__ == "__main__":
    main()

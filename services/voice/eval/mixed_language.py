"""Does Whisper keep the Portuguese words a learner says inside an English sentence?

The tutor teaches those words as "new words", so it needs them as said. The risk: with the
language forced to English, Whisper may swap them for English words ("prazo" -> "deadline"),
or mishear them. With auto-detection it may write the whole sentence in Portuguese.

Needs your own recordings (a synthetic voice can't mix languages like a learner does):

    python -m eval.record --mixed
    python -m eval.mixed_language --models small medium --out eval/results/mixed.md

Variants per model: `en` (forced English, no prompt), `en+prompt` (forced English with the
mixed prompt the service uses by default) and `auto` (language detection).
"""

import argparse
from collections import Counter
from pathlib import Path

from engines import MIXED_PROMPT, EngineError, InputError, WhisperStt
from eval.cleanup_risk import RECORDINGS
from eval.mixed_cases import MIXED_CASES
from eval.scoring import MixedOutcome, score_mixed, summarize

MIXED_RECORDINGS = RECORDINGS / "mixed"
VARIANTS = {"en": ("en", None), "en+prompt": ("en", MIXED_PROMPT), "auto": (None, None)}


def recording(case) -> Path | None:
    for ext in ("wav", "webm", "ogg", "m4a"):
        path = MIXED_RECORDINGS / f"{case.id}.{ext}"
        if path.exists():
            return path
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--models", nargs="+", default=["small"], help="Whisper sizes, e.g. small medium")
    parser.add_argument("--out", type=Path, help="also write the Markdown report here")
    args = parser.parse_args()

    cases = [(case, recording(case)) for case in MIXED_CASES]
    missing = [case.id for case, clip in cases if clip is None]
    if missing:
        print(f"No recording for: {', '.join(missing)}. Run: python -m eval.record --mixed")
    cases = [(case, clip) for case, clip in cases if clip is not None]
    if not cases:
        raise SystemExit(1)

    models = {m: WhisperStt(m) for m in args.models}
    variants = {f"{m}/{v}": (models[m], lang, prompt) for m in args.models for v, (lang, prompt) in VARIANTS.items()}
    rows, outcomes, errors = [], {name: [] for name in variants}, Counter()

    for case, clip in cases:
        cells = []
        for name, (stt, language, prompt) in variants.items():
            try:
                with open(clip, "rb") as audio:
                    result = stt.transcribe(audio, language, initial_prompt=prompt)
            except (EngineError, InputError) as e:
                print(f"[{name}] {case.id}: error | {e}")
                errors[name] += 1
                cells.append(f"error: {e}")
                continue
            outcome = score_mixed(case, result.text)
            outcomes[name].append(outcome)
            detected = f" ({result.language})" if language is None else ""
            cells.append(f"{outcome.value}{detected}: {result.text}")
            print(f"[{name}] {case.id}: {outcome.value}{detected} | {result.text}")
        cells = [c.replace("|", "/").replace("\n", " ") for c in cells]
        rows.append(f"| {case.id} | {case.text} | " + " | ".join(cells) + " |")

    names = list(variants)
    lines = [
        "# Whisper and Portuguese words in English sentences",
        "",
        "`kept` = the Portuguese words survived (good); `translated` = swapped for English (risk); "
        "`portuguese` = kept, but the English around them came out in Portuguese (risk); `other` = misheard. "
        "For `auto`, the detected language is in brackets. Kept rate counts errors as not kept.",
        "",
        "| Variant | Kept | Translated | Portuguese | Other | Errors | Kept rate |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for name in names:
        s = summarize(outcomes[name], MixedOutcome)
        rate = s["kept"] / len(cases)
        lines.append(
            f"| {name} | {s['kept']} | {s['translated']} | {s['portuguese']} | {s['other']} | {errors[name]} | {rate:.0%} |"
        )
    lines += ["", "| Case | Said | " + " | ".join(names) + " |", "| --- " * (2 + len(names)) + "|"]
    lines += rows
    report = "\n".join(lines) + "\n"
    print("\n" + report)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report)


if __name__ == "__main__":
    main()

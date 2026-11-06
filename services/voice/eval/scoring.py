"""Pure scoring helpers for the evaluation scripts."""

import math
import re
from enum import Enum

from eval.cases import Case


class Outcome(str, Enum):
    KEPT = "kept"  # the mistake survived: good, the tutor can see it
    CLEANED = "cleaned"  # Whisper "fixed" it: the risk we are testing
    OTHER = "other"  # neither phrase: misheard or rephrased


def normalize(text: str) -> str:
    text = text.lower().replace("’", "'")
    text = re.sub(r"[^\w\s']", " ", text)
    return " ".join(text.split())


def score(case: Case, transcript: str) -> Outcome:
    heard = f" {normalize(transcript)} "
    # The error is checked first: the fix can be a substring of it ("information(s)").
    if f" {case.error} " in heard:
        return Outcome.KEPT
    if f" {case.fix} " in heard:
        return Outcome.CLEANED
    return Outcome.OTHER


def summarize(outcomes: list[Outcome]) -> dict:
    counts = {o.value: outcomes.count(o) for o in Outcome}
    counts["kept_rate"] = round(counts["kept"] / len(outcomes), 2) if outcomes else 0.0
    return counts


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile."""
    ordered = sorted(values)
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]

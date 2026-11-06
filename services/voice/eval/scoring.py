"""Pure scoring helpers for the evaluation scripts."""

import math
import re
import unicodedata
from enum import Enum

from eval.cases import Case
from eval.mixed_cases import MixedCase


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


class MixedOutcome(str, Enum):
    KEPT = "kept"  # the Portuguese words survived: good, the tutor can teach them
    TRANSLATED = "translated"  # Whisper swapped them for English: the risk we are testing
    PORTUGUESE = "portuguese"  # kept, but the English around them came out in Portuguese
    OTHER = "other"  # neither: misheard


def fold(text: str) -> str:
    """`normalize`, also without accents: Whisper may write "reuniao" for "reunião"."""
    decomposed = unicodedata.normalize("NFKD", normalize(text))
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def score_mixed(case: MixedCase, transcript: str) -> MixedOutcome:
    heard = f" {fold(transcript)} "
    if f" {fold(case.pt)} " in heard:
        return MixedOutcome.KEPT if f" {fold(case.anchor)} " in heard else MixedOutcome.PORTUGUESE
    if any(f" {fold(en)} " in heard for en in case.en):
        return MixedOutcome.TRANSLATED
    return MixedOutcome.OTHER


def summarize(outcomes: list, kinds: type[Enum] = Outcome) -> dict:
    counts = {o.value: outcomes.count(o) for o in kinds}
    counts["kept_rate"] = round(counts["kept"] / len(outcomes), 2) if outcomes else 0.0
    return counts


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile."""
    ordered = sorted(values)
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]

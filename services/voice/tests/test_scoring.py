from eval.cases import CASES
from eval.scoring import Outcome, fold, normalize, percentile, score, summarize

GO = next(c for c in CASES if c.id == "past-go")


def test_normalize_lowercases_and_strips_punctuation_but_keeps_apostrophes():
    assert normalize("  He DOESN’T, have... access! ") == "he doesn't have access"


def test_error_kept_when_transcript_has_the_mistake():
    assert score(GO, "Yesterday, I go to the client meeting.") is Outcome.KEPT


def test_cleaned_when_transcript_has_the_fix():
    assert score(GO, "Yesterday I went to the client meeting.") is Outcome.CLEANED


def test_other_when_transcript_has_neither():
    assert score(GO, "Yesterday I was at the client meeting.") is Outcome.OTHER


def test_error_wins_when_fix_is_a_substring_of_the_error():
    case = next(c for c in CASES if c.id == "informations")
    assert score(case, "We need more informations about it.") is Outcome.KEPT
    assert score(case, "We need more information about it.") is Outcome.CLEANED


def test_every_case_error_appears_in_its_own_text():
    for case in CASES:
        assert case.error in normalize(case.text), case.id
        assert case.fix != case.error, case.id


def test_summarize_counts_outcomes_and_kept_rate():
    summary = summarize([Outcome.KEPT, Outcome.KEPT, Outcome.CLEANED, Outcome.OTHER])
    assert summary == {"kept": 2, "cleaned": 1, "other": 1, "kept_rate": 0.5}


def test_percentile_nearest_rank():
    values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
    assert percentile(values, 50) == 500
    assert percentile(values, 95) == 1000
    assert percentile([42], 95) == 42


# Portuguese words inside English sentences (eval/mixed_language.py)

from eval.mixed_cases import MIXED_CASES  # noqa: E402
from eval.scoring import MixedOutcome, score_mixed  # noqa: E402

PRAZO = next(c for c in MIXED_CASES if c.id == "prazo")
REUNIAO = next(c for c in MIXED_CASES if c.id == "reuniao")


def test_mixed_kept_when_the_portuguese_word_survives():
    assert score_mixed(PRAZO, "The prazo for the report is Friday.") is MixedOutcome.KEPT


def test_mixed_kept_without_accents():
    assert score_mixed(REUNIAO, "I have a reuniao with the sponsor tomorrow.") is MixedOutcome.KEPT


def test_mixed_translated_when_whisper_swaps_it_for_english():
    assert score_mixed(PRAZO, "The deadline for the report is Friday.") is MixedOutcome.TRANSLATED


def test_mixed_other_when_misheard():
    assert score_mixed(PRAZO, "The price for the report is Friday.") is MixedOutcome.OTHER


def test_summarize_counts_mixed_outcomes():
    counts = summarize([MixedOutcome.KEPT, MixedOutcome.TRANSLATED])
    assert counts == {"kept": 1, "translated": 1, "other": 0, "kept_rate": 0.5}


def test_every_mixed_case_portuguese_part_appears_in_its_own_text():
    for case in MIXED_CASES:
        assert fold(case.pt) in fold(case.text), case.id

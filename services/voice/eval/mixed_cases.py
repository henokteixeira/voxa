"""English sentences with Portuguese words, as a learner says them when stuck on a word.

`pt` is the Portuguese part as said; `en` are the English words Whisper could swap it for;
`anchor` is English from the same sentence that must survive (else Whisper wrote it in Portuguese).
The tutor needs the Portuguese words (to teach them as new words), so swapping is the risk.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class MixedCase:
    id: str
    text: str
    pt: str
    en: tuple[str, ...]
    anchor: str


# fmt: off
MIXED_CASES = [
    MixedCase("prazo", "The prazo for the report is Friday.", "prazo", ("deadline", "due date"), "friday"),
    MixedCase("reuniao", "I have a reunião with the sponsor tomorrow.", "reunião", ("meeting",), "tomorrow"),
    MixedCase("relatorio", "I sent the relatório to the team.", "relatório", ("report",), "the team"),
    MixedCase("patrocinador", "The patrocinador asked about the budget.", "patrocinador", ("sponsor",), "the budget"),
    MixedCase("orcamento", "We need to check the orçamento first.", "orçamento", ("budget",), "first"),
    MixedCase("cronograma", "The cronograma changed last week.", "cronograma", ("schedule", "timeline"), "last week"),
    MixedCase("entrega", "The entrega is almost done.", "entrega", ("delivery",), "almost done"),
    MixedCase("treinamento", "We prepared a treinamento for the volunteers.", "treinamento", ("training",), "volunteers"),
    MixedCase("phrase", "I want to say que a gente precisa de mais tempo.", "a gente precisa de mais tempo",
              ("we need more time",), "i want to say"),
    MixedCase("como-se-diz", "Como se diz cobrança in English?", "como se diz", ("how do you say", "how to say"),
              "in english"),
]
# fmt: on

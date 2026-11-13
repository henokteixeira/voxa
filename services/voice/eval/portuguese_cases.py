"""Whole turns in Portuguese, as a learner says them when the English does not come.

With the language pinned to English, Whisper translates these. eval/language_switch.py
measures how sure Whisper is that each one is Portuguese, to set WHISPER_NATIVE_MIN_PROBABILITY.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class PortugueseCase:
    id: str
    text: str


# fmt: off
PORTUGUESE_CASES = [
    PortugueseCase("nao-sei-dizer", "Não sei como dizer isso em inglês."),
    PortugueseCase("reuniao-atrasou", "A reunião de ontem atrasou porque o sistema caiu."),
    PortugueseCase("final-de-semana", "No final de semana eu fui na casa da minha mãe."),
    PortugueseCase("relatorio", "Eu preciso terminar o relatório antes de sexta."),
    PortugueseCase("explicar-melhor", "Pode explicar de novo, por favor? Eu não entendi."),
    PortugueseCase("voluntarios", "Os voluntários chegaram cedo e ajudaram a arrumar tudo."),
    PortugueseCase("cansado", "Hoje eu estou um pouco cansado, dormi mal."),
    PortugueseCase("orcamento", "A gente ainda está esperando a aprovação do orçamento."),
    PortugueseCase("curta", "Esqueci a palavra."),
    PortugueseCase("comida", "Eu gosto de cozinhar, principalmente feijoada."),
]
# fmt: on

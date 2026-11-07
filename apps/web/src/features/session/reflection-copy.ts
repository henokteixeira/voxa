import type { Copy } from "@/lib/i18n/locale";

/** Copy for the screens around a session: the confidence check-in and the summary. */
export interface ReflectionCopy {
  back: string;
  checkInQuestion: (meeting: string) => string;
  checkInNote: string;
  checkOutQuestion: (meeting: string) => string;
  confidenceLabel: string;
  notAtAll: string;
  fully: string;
  outlined: (before: number) => string;
  continue: string;
  skip: string;
  sessionDone: string;
  seeMistakes: string;
  mistakesLine: (count: number, fixed: number, newWords: number) => string;
  whatToKeep: string;
  sessionMistakes: string;
  signalsLabel: string;
  signals: {
    pace: string;
    /** Under the words per minute; null when the long pauses were not measured. */
    perMinute: (longPausesPerMinute: string | null) => string;
    fixedYourself: string;
    afterHint: string;
    noHints: string;
    pause: string;
    average: string;
    mistakes: string;
    per100: string;
    noWords: string;
    notMeasured: string;
    ofTotal: (fixed: number, total: number) => string;
  };
  resolution: { fixed: string; answer: string; small: string; newWord: string };
  seen: (times: number) => string;
  isNew: string;
  saved: string;
  savedEncouragement: string;
  savedSession: string;
  savedToBank: (count: number) => string;
  backToToday: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const REFLECTION_COPY: Copy<ReflectionCopy> = {
  en: {
    back: "Back",
    checkInQuestion: (meeting) => `How confident do you feel about a real ${meeting} right now?`,
    checkInNote: "You'll answer again at the end, so you can see the difference. There's no wrong answer.",
    checkOutQuestion: (meeting) => `And now, how confident do you feel about a real ${meeting}?`,
    confidenceLabel: "Confidence from 1 to 5",
    notAtAll: "Not at all",
    fully: "Fully",
    outlined: (before) => `The circled number is your answer from before (${before}).`,
    continue: "Continue",
    skip: "Skip",
    sessionDone: "Session done",
    seeMistakes: "See your mistakes",
    mistakesLine: (count, fixed, newWords) =>
      `${plural(count, "mistake", "mistakes")} · ${fixed} fixed by you` +
      (newWords ? ` · ${plural(newWords, "new word", "new words")}` : ""),
    whatToKeep: "What to keep",
    sessionMistakes: "Mistakes from this session",
    signalsLabel: "Fluency signals",
    signals: {
      pace: "Pace",
      perMinute: (pauses) => (pauses === null ? "words a minute" : `words a minute · ${pauses} long pauses a minute`),
      fixedYourself: "Fixed yourself",
      afterHint: "after a hint",
      noHints: "no hints needed",
      pause: "Pause before answering",
      average: "average",
      mistakes: "Mistakes",
      per100: "per 100 words",
      noWords: "no words heard",
      notMeasured: "not measured",
      ofTotal: (fixed, total) => `${fixed} of ${total}`,
    },
    resolution: { fixed: "Fixed after a hint", answer: "Learned with help", small: "Small mistake", newWord: "New word" },
    seen: (times) => `Seen ${times} times`,
    isNew: "New",
    saved: "Session saved",
    savedEncouragement: "Every mistake today is something you'll say better next time.",
    savedSession: "Your session is saved.",
    savedToBank: (count) => `${plural(count, "mistake", "mistakes")} saved to your mistake bank.`,
    backToToday: "Back to Today",
  },
  "pt-BR": {
    back: "Voltar",
    checkInQuestion: (meeting) => `Quanta confiança você tem agora para ${meeting}?`,
    checkInNote: "Você responde de novo no fim, para ver a diferença. Não existe resposta errada.",
    checkOutQuestion: (meeting) => `E agora, quanta confiança você tem para ${meeting}?`,
    confidenceLabel: "Confiança de 1 a 5",
    notAtAll: "Nada confiante",
    fully: "Totalmente",
    outlined: (before) => `O número com contorno é a sua resposta de antes (${before}).`,
    continue: "Continuar",
    skip: "Pular",
    sessionDone: "Sessão concluída",
    seeMistakes: "Ver seus erros",
    mistakesLine: (count, fixed, newWords) =>
      `${plural(count, "erro", "erros")} · ${plural(fixed, "corrigido", "corrigidos")} por você` +
      (newWords ? ` · ${plural(newWords, "palavra nova", "palavras novas")}` : ""),
    whatToKeep: "Para guardar",
    sessionMistakes: "Erros desta sessão",
    signalsLabel: "Sinais de fluência",
    signals: {
      pace: "Ritmo",
      perMinute: (pauses) =>
        pauses === null ? "palavras por minuto" : `palavras por minuto · ${pauses} pausas longas por minuto`,
      fixedYourself: "Autocorreção",
      afterHint: "depois de uma dica",
      noHints: "sem precisar de dica",
      pause: "Pausa antes de responder",
      average: "média",
      mistakes: "Erros",
      per100: "a cada 100 palavras",
      noWords: "nenhuma palavra ouvida",
      notMeasured: "não medido",
      ofTotal: (fixed, total) => `${fixed} de ${total}`,
    },
    resolution: { fixed: "Corrigido depois de uma dica", answer: "Aprendido com ajuda", small: "Erro pequeno", newWord: "Palavra nova" },
    seen: (times) => `Visto ${times} vezes`,
    isNew: "Novo",
    saved: "Sessão salva",
    savedEncouragement: "Cada erro de hoje é algo que você vai dizer melhor da próxima vez.",
    savedSession: "Sua sessão está salva.",
    savedToBank: (count) => `${plural(count, "erro salvo", "erros salvos")} no seu banco de erros.`,
    backToToday: "Voltar para Hoje",
  },
};

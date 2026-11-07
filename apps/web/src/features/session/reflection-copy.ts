import type { SignalName } from "@/lib/api";
import type { Copy } from "@/lib/i18n/locale";

/** Copy for the session summary. */
export interface ReflectionCopy {
  continue: string;
  sessionDone: string;
  placementDone: string;
  placementNoLevel: string;
  placementWhere: string;
  firstSession: string;
  seeInProgress: string;
  seeMistakes: string;
  mistakesLine: (count: number, fixed: number, newWords: number) => string;
  whatToKeep: string;
  sessionMistakes: string;
  signalsLabel: string;
  comparison: {
    label: string;
    comparedWith: (sessions: number) => string;
    /** What went better, as the end of "Compared with your last sessions: …". */
    better: Record<SignalName, string>;
    list: (items: string[]) => string;
    steady: (sessions: number) => string;
  };
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
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const REFLECTION_COPY: Copy<ReflectionCopy> = {
  en: {
    continue: "Continue",
    sessionDone: "Session done",
    placementDone: "Thanks for the chat",
    placementNoLevel: "There wasn't enough to estimate a level this time. You can try again from Progress.",
    placementWhere: "Your sessions now start with the right amount of help. You can see what the tutor noticed in Progress.",
    firstSession: "Start my first session",
    seeInProgress: "See it in Progress",
    seeMistakes: "See your mistakes",
    mistakesLine: (count, fixed, newWords) =>
      `${plural(count, "mistake", "mistakes")} · ${fixed} fixed by you` +
      (newWords ? ` · ${plural(newWords, "new word", "new words")}` : ""),
    whatToKeep: "What to keep",
    sessionMistakes: "Mistakes from this session",
    signalsLabel: "Fluency signals",
    comparison: {
      label: "Compared with your last sessions",
      comparedWith: (n) => (n === 1 ? "Compared with your last session" : `Compared with your last ${n} sessions`),
      better: {
        unaidedShare: "more answers without help",
        wordsPerMinute: "a faster pace",
        longPausesPerMinute: "fewer long pauses",
        averagePauseMs: "shorter pauses before answering",
        mistakesPer100Words: "fewer mistakes",
        selfCorrectionRate: "more mistakes fixed by you",
      },
      list: (items) => `${capitalize(new Intl.ListFormat("en", { type: "conjunction" }).format(items))}.`,
      steady: (n) => `Much like your last ${n === 1 ? "session" : "sessions"}. Steady practice is what builds fluency.`,
    },
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
    continue: "Continuar",
    sessionDone: "Sessão concluída",
    placementDone: "Obrigado pela conversa",
    placementNoLevel: "Não deu para estimar um nível desta vez. Você pode tentar de novo pela aba Progresso.",
    placementWhere: "Agora suas sessões começam com a ajuda certa. Você pode ver o que o tutor percebeu na aba Progresso.",
    firstSession: "Começar minha primeira sessão",
    seeInProgress: "Ver no Progresso",
    seeMistakes: "Ver seus erros",
    mistakesLine: (count, fixed, newWords) =>
      `${plural(count, "erro", "erros")} · ${plural(fixed, "corrigido", "corrigidos")} por você` +
      (newWords ? ` · ${plural(newWords, "palavra nova", "palavras novas")}` : ""),
    whatToKeep: "Para guardar",
    sessionMistakes: "Erros desta sessão",
    signalsLabel: "Sinais de fluência",
    comparison: {
      label: "Comparado com suas últimas sessões",
      comparedWith: (n) => (n === 1 ? "Comparado com sua última sessão" : `Comparado com suas últimas ${n} sessões`),
      better: {
        unaidedShare: "mais respostas sem ajuda",
        wordsPerMinute: "ritmo mais rápido",
        longPausesPerMinute: "menos pausas longas",
        averagePauseMs: "pausas mais curtas antes de responder",
        mistakesPer100Words: "menos erros",
        selfCorrectionRate: "mais erros corrigidos por você",
      },
      list: (items) => `${capitalize(new Intl.ListFormat("pt-BR", { type: "conjunction" }).format(items))}.`,
      steady: (n) => `Parecido com ${n === 1 ? "sua última sessão" : "suas últimas sessões"}. É a prática constante que constrói a fluência.`,
    },
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

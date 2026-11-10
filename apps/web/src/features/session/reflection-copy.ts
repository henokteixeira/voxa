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
  takeThese: string;
  takeaways: string;
  youSaid: (words: string) => string;
  newWords: string;
  smallDetails: (count: number) => string;
  smallDetailsTitle: string;
  smallDetailsNote: string;
  tryThem: string;
  later: string;
  continueMission: string;
  reviewSaved: string;
  reviewSavedNote: string;
  reviewXp: (xp: number) => string;
  done: string;
  close: string;
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
    answerLength: string;
    answerLengthNote: string;
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
    seeMistakes: "See what to keep",
    takeThese: "Take these with you",
    takeaways: "Patterns to take with you",
    youSaid: (words) => `You said: “${words}”`,
    newWords: "New words",
    smallDetails: (n) => `+ ${plural(n, "small detail", "small details")}, saved for later`,
    smallDetailsTitle: "Small details",
    smallDetailsNote: "They didn't get in the way. Saved for your practice.",
    tryThem: "Try them · 1 min",
    later: "Later",
    continueMission: "Continue mission",
    reviewSaved: "Saved for your review",
    reviewSavedNote: "Mistakes are how you learn. These will come back a little later each time.",
    reviewXp: (xp) => `+${xp} XP toward today's goal`,
    done: "Done",
    close: "Close",
    signalsLabel: "Fluency signals",
    comparison: {
      label: "Compared with your last sessions",
      comparedWith: (n) => (n === 1 ? "Compared with your last session" : `Compared with your last ${n} sessions`),
      better: {
        unaidedShare: "more answers without help",
        wordsPerMinute: "a faster pace",
        wordsPerAnswer: "longer answers",
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
      answerLength: "Words per answer",
      answerLengthNote: "on average",
      perMinute: (pauses) => (pauses === null ? "words a minute" : `words a minute · ${pauses} long pauses a minute`),
      fixedYourself: "Fixed with a hint",
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
    seeMistakes: "Ver o que levar",
    takeThese: "Leve estes com você",
    takeaways: "Padrões para levar",
    youSaid: (words) => `Você disse: “${words}”`,
    newWords: "Palavras novas",
    smallDetails: (n) => `+ ${plural(n, "detalhe pequeno", "detalhes pequenos")}, guardados para depois`,
    smallDetailsTitle: "Detalhes pequenos",
    smallDetailsNote: "Não atrapalharam. Guardados para a sua prática.",
    tryThem: "Tentar · 1 min",
    later: "Depois",
    continueMission: "Continuar missão",
    reviewSaved: "Guardado para sua revisão",
    reviewSavedNote: "É errando que se aprende. Eles vão voltar, cada vez um pouco mais tarde.",
    reviewXp: (xp) => `+${xp} XP para a meta de hoje`,
    done: "Concluir",
    close: "Fechar",
    signalsLabel: "Sinais de fluência",
    comparison: {
      label: "Comparado com suas últimas sessões",
      comparedWith: (n) => (n === 1 ? "Comparado com sua última sessão" : `Comparado com suas últimas ${n} sessões`),
      better: {
        unaidedShare: "mais respostas sem ajuda",
        wordsPerMinute: "ritmo mais rápido",
        wordsPerAnswer: "respostas mais longas",
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
      answerLength: "Palavras por resposta",
      answerLengthNote: "em média",
      perMinute: (pauses) =>
        pauses === null ? "palavras por minuto" : `palavras por minuto · ${pauses} pausas longas por minuto`,
      fixedYourself: "Corrigiu com a dica",
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
    saved: "Sessão salva",
    savedEncouragement: "Cada erro de hoje é algo que você vai dizer melhor da próxima vez.",
    savedSession: "Sua sessão está salva.",
    savedToBank: (count) => `${plural(count, "erro salvo", "erros salvos")} no seu banco de erros.`,
    backToToday: "Voltar para Hoje",
  },
};

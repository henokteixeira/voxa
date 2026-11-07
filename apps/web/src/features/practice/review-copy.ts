import type { Copy } from "@/lib/i18n/locale";

/** Copy for a short review: a cue in the learner's language, their answer, then one way to say it. */
export interface ReviewCopy {
  close: string;
  progress: (index: number, total: number) => string;
  sayIt: string;
  yourAnswer: string;
  check: string;
  dontKnow: string;
  checking: string;
  gotIt: string;
  almost: string;
  youSaid: string;
  oneWay: string;
  sayOnceMore: (when: string) => string;
  next: string;
  finish: string;
  failed: string;
  answerFailed: string;
  retry: string;
  skip: string;
}

export const REVIEW_COPY: Copy<ReviewCopy> = {
  en: {
    close: "Close",
    progress: (index, total) => `${index} of ${total}`,
    sayIt: "Say it in English",
    yourAnswer: "Your answer",
    check: "Check",
    dontKnow: "I don't know, show me",
    checking: "Checking",
    gotIt: "That's it",
    almost: "Almost",
    youSaid: "You said",
    oneWay: "One way to say it",
    sayOnceMore: (when) => `Say it once more · this one comes back ${when}`,
    next: "Next",
    finish: "Finish",
    failed: "Couldn't load this one.",
    answerFailed: "Couldn't check that answer. Try again.",
    retry: "Try again",
    skip: "Skip",
  },
  "pt-BR": {
    close: "Fechar",
    progress: (index, total) => `${index} de ${total}`,
    sayIt: "Diga em inglês",
    yourAnswer: "Sua resposta",
    check: "Conferir",
    dontKnow: "Não sei, me mostra",
    checking: "Conferindo",
    gotIt: "Isso mesmo",
    almost: "Quase",
    youSaid: "Você disse",
    oneWay: "Um jeito de dizer",
    sayOnceMore: (when) => `Diga mais uma vez · este volta ${when}`,
    next: "Próximo",
    finish: "Concluir",
    failed: "Não deu para carregar este.",
    answerFailed: "Não deu para conferir essa resposta. Tente de novo.",
    retry: "Tentar de novo",
    skip: "Pular",
  },
};

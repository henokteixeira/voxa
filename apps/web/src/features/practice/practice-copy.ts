import type { ReviewStatus } from "@/lib/api";
import type { Copy } from "@/lib/i18n/locale";

/** Copy for the Practice tab, a pattern's page and the review screen. */
export interface PracticeCopy {
  title: string;
  loading: string;
  loadFailed: string;
  tryAgain: string;
  emptyTitle: string;
  emptyBody: string;
  dueTitle: (count: number) => string;
  dueNote: string;
  todayReview: (count: number) => string;
  startReview: string;
  nothingDue: string;
  nextReview: (day: string) => string;
  nothingScheduled: string;
  stillPractice: string;
  view: string;
  patterns: (count: number) => string;
  newWords: (count: number) => string;
  earlier: string;
  earlierNote: string;
  reviewOn: (day: string) => string;
  notScheduled: string;
  status: Record<ReviewStatus, string>;
  back: string;
  times: (count: number) => string;
  nextReviewLabel: string;
  yourSentences: string;
  notAMistake: string;
  practiceThis: string;
  reviewDone: string;
  reviewDoneNote: string;
  done: string;
  reviewEmpty: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const PRACTICE_COPY: Copy<PracticeCopy> = {
  en: {
    title: "Practice",
    loading: "Loading your practice",
    loadFailed: "Can't load your practice. Check that Voxa's server is running on your PC.",
    tryAgain: "Try again",
    emptyTitle: "Nothing to practice yet",
    emptyBody: "Mistakes are how you learn. After your first session, the patterns worth practicing show up here.",
    dueTitle: (n) => `${plural(n, "item", "items")} to review today`,
    dueNote: "By voice · about 3 min",
    todayReview: (n) => `Review · ${plural(n, "item", "items")}`,
    startReview: "Start review",
    nothingDue: "Nothing to review right now",
    nextReview: (day) => `Next review: ${day}`,
    nothingScheduled: "Nothing scheduled yet.",
    stillPractice: "You can still open any pattern and practice it.",
    view: "Show",
    patterns: (n) => `Patterns · ${n}`,
    newWords: (n) => `New words · ${n}`,
    earlier: "From before patterns",
    earlierNote: "Saved before Voxa grouped mistakes by pattern. They are not reviewed.",
    reviewOn: (day) => `Review ${day}`,
    notScheduled: "Not scheduled",
    status: { new: "New", improving: "Improving", mastered: "Mastered" },
    back: "Back",
    times: (n) => (n === 1 ? "once" : `${n} times`),
    nextReviewLabel: "next review",
    yourSentences: "Your sentences",
    notAMistake: "Not a mistake?",
    practiceThis: "Practice this · 1 min",
    reviewDone: "Review done",
    reviewDoneNote: "The longer the wait, the better you know it.",
    done: "Done",
    reviewEmpty: "Nothing to review right now.",
  },
  "pt-BR": {
    title: "Praticar",
    loading: "Carregando sua prática",
    loadFailed: "Não deu para carregar sua prática. Veja se o servidor do Voxa está rodando no seu PC.",
    tryAgain: "Tentar de novo",
    emptyTitle: "Nada para praticar ainda",
    emptyBody: "É errando que se aprende. Depois da sua primeira sessão, os padrões que vale a pena praticar aparecem aqui.",
    dueTitle: (n) => `${plural(n, "item", "itens")} para revisar hoje`,
    dueNote: "Por voz · uns 3 min",
    todayReview: (n) => `Revisão · ${plural(n, "item", "itens")}`,
    startReview: "Começar revisão",
    nothingDue: "Nada para revisar agora",
    nextReview: (day) => `Próxima revisão: ${day}`,
    nothingScheduled: "Nada agendado ainda.",
    stillPractice: "Você ainda pode abrir qualquer padrão e praticar.",
    view: "Mostrar",
    patterns: (n) => `Padrões · ${n}`,
    newWords: (n) => `Palavras novas · ${n}`,
    earlier: "De antes dos padrões",
    earlierNote: "Salvos antes de o Voxa agrupar os erros por padrão. Eles não entram na revisão.",
    reviewOn: (day) => `Revisar ${day}`,
    notScheduled: "Sem data",
    status: { new: "Novo", improving: "Melhorando", mastered: "Dominado" },
    back: "Voltar",
    times: (n) => (n === 1 ? "uma vez" : `${n} vezes`),
    nextReviewLabel: "próxima revisão",
    yourSentences: "Suas frases",
    notAMistake: "Não é um erro?",
    practiceThis: "Praticar este · 1 min",
    reviewDone: "Revisão concluída",
    reviewDoneNote: "Quanto maior a espera, melhor você já sabe.",
    done: "Concluir",
    reviewEmpty: "Nada para revisar agora.",
  },
};

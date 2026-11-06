import type { DismissReason } from "@/lib/api";
import type { Copy } from "@/lib/i18n/locale";

export interface MistakesCopy {
  title: string;
  loadFailed: string;
  loadFailedBody: string;
  tryAgain: string;
  emptyTitle: string;
  emptyBody: string;
  statusGroup: string;
  nothingHere: string;
  close: string;
  mistake: string;
  whyNot: string;
  reasons: Record<DismissReason, string>;
  leavesBank: string;
  removeFailed: string;
  remove: string;
  timesSoFar: (n: number) => string;
  notAMistake: string;
}

export const MISTAKES_COPY: Copy<MistakesCopy> = {
  en: {
    title: "Mistakes",
    loadFailed: "Can't load your mistakes",
    loadFailedBody: "Check that Voxa's server is running on your PC.",
    tryAgain: "Try again",
    emptyTitle: "No mistakes yet",
    emptyBody: "Mistakes are how you learn. After your first session, the ones worth practicing show up here.",
    statusGroup: "Status",
    nothingHere: "Nothing here yet.",
    close: "Close",
    mistake: "Mistake",
    whyNot: "Why isn't it a mistake?",
    reasons: {
      transcript_error: "I said it right; the transcript is wrong",
      both_correct: "Both ways are correct",
      not_needed: "I don't need this one",
    },
    leavesBank: "It leaves the bank and won't count again.",
    removeFailed: "Couldn't remove it. Try again.",
    remove: "Remove from bank",
    timesSoFar: (n) => (n === 1 ? "Once so far" : `${n} times so far`),
    notAMistake: "This isn't a mistake",
  },
  "pt-BR": {
    title: "Erros",
    loadFailed: "Não deu para carregar seus erros",
    loadFailedBody: "Veja se o servidor do Voxa está rodando no seu PC.",
    tryAgain: "Tentar de novo",
    emptyTitle: "Nenhum erro ainda",
    emptyBody: "É errando que se aprende. Depois da sua primeira sessão, os erros que valem praticar aparecem aqui.",
    statusGroup: "Situação",
    nothingHere: "Nada aqui ainda.",
    close: "Fechar",
    mistake: "Erro",
    whyNot: "Por que não é um erro?",
    reasons: {
      transcript_error: "Eu falei certo; a transcrição está errada",
      both_correct: "Os dois jeitos estão certos",
      not_needed: "Não preciso deste",
    },
    leavesBank: "Ele sai do banco e não conta mais.",
    removeFailed: "Não deu para remover. Tente de novo.",
    remove: "Remover do banco",
    timesSoFar: (n) => (n === 1 ? "Uma vez até agora" : `${n} vezes até agora`),
    notAMistake: "Isto não é um erro",
  },
};

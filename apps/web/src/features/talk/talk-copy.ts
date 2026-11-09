import type { Copy } from "@/lib/i18n/locale";

export interface TalkCopy {
  title: string;
  intro: string;
  categories: string;
  everyday: string;
  work: string;
}

export const TALK_COPY: Copy<TalkCopy> = {
  en: {
    title: "Talk",
    intro: "Free practice, outside the daily mission. You choose.",
    categories: "Conversations",
    everyday: "Everyday",
    work: "Work",
  },
  "pt-BR": {
    title: "Conversar",
    intro: "Prática livre, fora da missão do dia. Você escolhe.",
    categories: "Conversas",
    everyday: "Dia a dia",
    work: "Trabalho",
  },
};

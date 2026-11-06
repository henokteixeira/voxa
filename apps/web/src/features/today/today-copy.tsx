import type { ReactNode } from "react";
import type { ApiStatus } from "@/hooks/use-api-status";
import type { Copy, Locale } from "@/lib/i18n/locale";

type Problem = Extract<ApiStatus, "unreachable" | "error">;

export interface TodayCopy {
  greeting: (hour: number) => string;
  welcomeTitle: string;
  welcomeBody: string;
  offlineTitle: string;
  offlineBody: string;
  problem: Record<Problem, { title: string; detail: ReactNode }>;
  checkAgain: string;
  readyTitle: string;
  readyBody: (mode: string) => string;
  start: string;
  otherPractice: string;
  language: string;
}

export const LANGUAGE_NAMES: Record<Locale, string> = { "pt-BR": "Português", en: "English" };

export const TODAY_COPY: Copy<TodayCopy> = {
  en: {
    greeting: (h) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"),
    welcomeTitle: "Mistakes are welcome here",
    welcomeBody:
      "This is a safe place to practice. Stuck on a word? Say it in Portuguese, and Voxa helps you say it in English. " +
      "Voxa's AI makes mistakes too, and tells you when it doesn't know something.",
    offlineTitle: "Sessions need a connection",
    offlineBody: "Connect to the internet and Voxa checks again on its own.",
    problem: {
      unreachable: {
        title: "Voxa's server isn't running",
        detail: (
          <>
            Start the API on your PC (<code>pnpm dev:api</code>), then check again.
          </>
        ),
      },
      error: {
        title: "Voxa's server has a problem",
        detail: "It answered with an error. Check the API logs on your PC, then try again.",
      },
    },
    checkAgain: "Check again",
    readyTitle: "Your first session is ready",
    readyBody: (mode) => `${mode} · about 6 min. Your mistake bank and progress start filling from here.`,
    start: "Start",
    otherPractice: "Other practice",
    language: "Language",
  },
  "pt-BR": {
    greeting: (h) => (h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"),
    welcomeTitle: "Aqui, errar faz parte",
    welcomeBody:
      "Este é um lugar seguro para praticar. Travou numa palavra? Diga em português e o Voxa ajuda você a dizer em inglês. " +
      "A IA do Voxa também erra e avisa quando não sabe algo.",
    offlineTitle: "As sessões precisam de internet",
    offlineBody: "Conecte-se à internet e o Voxa verifica de novo sozinho.",
    problem: {
      unreachable: {
        title: "O servidor do Voxa não está rodando",
        detail: (
          <>
            Inicie a API no seu PC (<code>pnpm dev:api</code>) e verifique de novo.
          </>
        ),
      },
      error: {
        title: "O servidor do Voxa está com um problema",
        detail: "Ele respondeu com um erro. Veja os logs da API no seu PC e tente de novo.",
      },
    },
    checkAgain: "Verificar de novo",
    readyTitle: "Sua primeira sessão está pronta",
    readyBody: (mode) => `${mode} · cerca de 6 min. Seu banco de erros e seu progresso começam a ser preenchidos a partir daqui.`,
    start: "Começar",
    otherPractice: "Outros treinos",
    language: "Idioma",
  },
};

import type { ReactNode } from "react";
import type { ApiStatus } from "@/hooks/use-api-status";
import type { Copy, Locale } from "@/lib/i18n/locale";

type Problem = Extract<ApiStatus, "unreachable" | "error">;

export interface TodayCopy {
  greeting: (hour: number) => string;
  offlineTitle: string;
  offlineBody: string;
  problem: Record<Problem, { title: string; detail: ReactNode }>;
  checkAgain: string;
  readyTitle: string;
  placementTitle: string;
  placementBody: string;
  readyBody: string;
  start: string;
  pausedTitle: string;
  pausedBody: (mode: string, elapsed: string) => string;
  continueSession: string;
  close: string;
  language: string;
  languageHint: string;
  talk: string;
  settings: string;
  pauseTitle: string;
  pauseHint: string;
  seconds: (ms: number) => string;
}

export const LANGUAGE_NAMES: Record<Locale, string> = { "pt-BR": "Português", en: "English" };

export const TODAY_COPY: Copy<TodayCopy> = {
  en: {
    greeting: (h) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"),
    offlineTitle: "Sessions need a connection",
    offlineBody: "Connect to the internet and Voxa checks again on its own.",
    problem: {
      unreachable: {
        title: "Voxa's server isn't running",
        detail: (
          <>
            Start Voxa on your PC (<code>docker compose up</code>), then check again.
          </>
        ),
      },
      error: {
        title: "Voxa's server has a problem",
        detail: "It answered with an error. Check the API logs on your PC, then try again.",
      },
    },
    checkAgain: "Check again",
    readyTitle: "What do you want to practice now?",
    placementTitle: "Let's start by finding your level",
    placementBody:
      "A relaxed 7-minute conversation about your work. No corrections: it only shows how much help your sessions should give.",
    readyBody: "Pick a conversation in Talk. Each one takes about 5 to 10 min.",
    start: "Start",
    pausedTitle: "Your session is paused",
    pausedBody: (mode, elapsed) => `${mode} · ${elapsed}. Pick up where you left off.`,
    continueSession: "Continue session",
    close: "Close",
    language: "Interface language",
    languageHint: "Menus and help. The conversation stays in English.",
    talk: "Talk",
    settings: "Settings",
    pauseTitle: "Pause before Voxa answers",
    pauseHint: "How long you can stay quiet before your turn is sent. Tap the ball to send sooner.",
    seconds: (ms) => `${(ms / 1000).toLocaleString("en")} s`,
  },
  "pt-BR": {
    greeting: (h) => (h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"),
    offlineTitle: "As sessões precisam de internet",
    offlineBody: "Conecte-se à internet e o Voxa verifica de novo sozinho.",
    problem: {
      unreachable: {
        title: "O servidor do Voxa não está rodando",
        detail: (
          <>
            Inicie o Voxa no seu PC (<code>docker compose up</code>) e verifique de novo.
          </>
        ),
      },
      error: {
        title: "O servidor do Voxa está com um problema",
        detail: "Ele respondeu com um erro. Veja os logs da API no seu PC e tente de novo.",
      },
    },
    checkAgain: "Verificar de novo",
    readyTitle: "O que você quer treinar agora?",
    placementTitle: "Vamos começar descobrindo seu nível",
    placementBody:
      "Uma conversa tranquila de 7 minutos sobre o seu trabalho. Sem correções: serve só para saber quanta ajuda as sessões devem dar.",
    readyBody: "Escolha uma conversa em Conversar. Cada uma leva cerca de 5 a 10 min.",
    start: "Começar",
    pausedTitle: "Sua sessão está pausada",
    pausedBody: (mode, elapsed) => `${mode} · ${elapsed}. Continue de onde parou.`,
    continueSession: "Continuar sessão",
    close: "Fechar",
    language: "Idioma da interface",
    languageHint: "Menus e ajuda. A conversa continua em inglês.",
    talk: "Conversar",
    settings: "Configurações",
    pauseTitle: "Pausa antes do Voxa responder",
    pauseHint: "Quanto tempo você pode ficar em silêncio antes da sua fala ser enviada. Toque na bolinha para enviar antes.",
    seconds: (ms) => `${(ms / 1000).toLocaleString("pt-BR")} s`,
  },
};

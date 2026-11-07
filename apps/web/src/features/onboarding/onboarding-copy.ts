import type { Copy } from "@/lib/i18n/locale";

export interface OnboardingCopy {
  back: string;
  stepOf: (step: number, total: number) => string;
  welcome: { title: string; body: string; action: string };
  mic: {
    title: string;
    phrase: string;
    start: string;
    listening: string;
    heard: string;
    notHearing: string;
    tryAgain: string;
    action: string;
  };
  chat: {
    title: string;
    body: string;
    points: string[];
    action: string;
    later: string;
  };
}

/** First run only. The level chat itself is a session (mode "placement"); these screens lead to it. */
export const ONBOARDING_COPY: Copy<OnboardingCopy> = {
  en: {
    back: "Back",
    stepOf: (step, total) => `Step ${step} of ${total}`,
    welcome: {
      title: "Speak up in your meetings.",
      body: "Practice real work conversations by voice. Mistakes are welcome: that's how you learn.",
      action: "Get started",
    },
    mic: {
      title: "Say this out loud",
      phrase: "“Good morning, everyone.”",
      start: "Turn on the microphone",
      listening: "Listening",
      heard: "We can hear you.",
      notHearing: "Nothing yet. Speak a bit louder, or check which microphone the browser uses.",
      tryAgain: "Try again",
      action: "Continue",
    },
    chat: {
      title: "A short chat about your work",
      body: "About 7 minutes. It helps the tutor give you the right amount of help.",
      points: [
        "No hints and no corrections. The tutor only listens.",
        "It starts easy and gets a bit harder.",
        "Stuck? Say “I don't know” or speak Portuguese. That's fine.",
      ],
      action: "Start the chat",
      later: "Do it later",
    },
  },
  "pt-BR": {
    back: "Voltar",
    stepOf: (step, total) => `Passo ${step} de ${total}`,
    welcome: {
      title: "Fale nas suas reuniões.",
      body: "Pratique conversas reais de trabalho por voz. Errar é bem-vindo: é assim que se aprende.",
      action: "Começar",
    },
    mic: {
      title: "Diga isto em voz alta",
      phrase: "“Good morning, everyone.”",
      start: "Ligar o microfone",
      listening: "Ouvindo",
      heard: "Estamos ouvindo você.",
      notHearing: "Nada ainda. Fale um pouco mais alto ou veja qual microfone o navegador está usando.",
      tryAgain: "Tentar de novo",
      action: "Continuar",
    },
    chat: {
      title: "Uma conversa curta sobre o seu trabalho",
      body: "Cerca de 7 minutos. Ajuda o tutor a dar a quantidade certa de ajuda.",
      points: [
        "Sem dicas e sem correções. O tutor só escuta.",
        "Começa fácil e fica um pouco mais difícil.",
        "Travou? Diga “I don't know” ou fale em português. Tudo bem.",
      ],
      action: "Começar a conversa",
      later: "Fazer depois",
    },
  },
};

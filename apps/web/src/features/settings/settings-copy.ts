import type { Copy } from "@/lib/i18n/locale";

export interface SettingsCopy {
  dailyTitle: string;
  dailyHint: string;
  minutes: (minutes: number) => string;
  dailyFailed: string;
  dailyLoadFailed: string;
  soundsTitle: string;
  soundsHint: string;
  guidedTitle: string;
  guidedHint: string;
  on: string;
  off: string;
}

export const SETTINGS_COPY: Copy<SettingsCopy> = {
  en: {
    dailyTitle: "Practice time a day",
    dailyHint: "Your daily XP goal follows from it. You can change it any time.",
    minutes: (m) => `${m} min`,
    dailyFailed: "Couldn't save it. Check that Voxa's server is running and try again.",
    dailyLoadFailed: "Couldn't load your daily goal. Check that Voxa's server is running, then open Settings again.",
    soundsTitle: "Sounds",
    soundsHint: "Soft tones for your turn, hints and XP. Never over the tutor's voice.",
    guidedTitle: "Step-by-step conversation at B2",
    guidedHint: "Up to B1, conversations always go step by step, with words to help. At B2 you can keep that help.",
    on: "On",
    off: "Off",
  },
  "pt-BR": {
    dailyTitle: "Tempo de prática por dia",
    dailyHint: "Sua meta diária de XP vem daqui. Dá para mudar quando quiser.",
    minutes: (m) => `${m} min`,
    dailyFailed: "Não deu para salvar. Veja se o servidor do Voxa está rodando e tente de novo.",
    dailyLoadFailed: "Não deu para carregar sua meta diária. Veja se o servidor do Voxa está rodando e abra os Ajustes de novo.",
    soundsTitle: "Sons",
    soundsHint: "Tons suaves para a sua vez, as pistas e o XP. Nunca por cima da voz do tutor.",
    guidedTitle: "Conversa passo a passo no B2",
    guidedHint: "Até o B1 a conversa é sempre passo a passo, com palavras para ajudar. No B2 você pode manter essa ajuda.",
    on: "Ligado",
    off: "Desligado",
  },
};

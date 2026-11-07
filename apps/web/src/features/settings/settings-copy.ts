import type { Copy } from "@/lib/i18n/locale";

export interface SettingsCopy {
  dailyTitle: string;
  dailyHint: string;
  minutes: (minutes: number) => string;
  dailyFailed: string;
  soundsTitle: string;
  soundsHint: string;
  on: string;
  off: string;
}

export const SETTINGS_COPY: Copy<SettingsCopy> = {
  en: {
    dailyTitle: "Practice time a day",
    dailyHint: "Your daily XP goal follows from it. You can change it any time.",
    minutes: (m) => `${m} min`,
    dailyFailed: "Couldn't save it. Check that Voxa's server is running and try again.",
    soundsTitle: "Sounds",
    soundsHint: "Soft tones for your turn, hints and XP. Never over the tutor's voice.",
    on: "On",
    off: "Off",
  },
  "pt-BR": {
    dailyTitle: "Tempo de prática por dia",
    dailyHint: "Sua meta diária de XP vem daqui. Dá para mudar quando quiser.",
    minutes: (m) => `${m} min`,
    dailyFailed: "Não deu para salvar. Veja se o servidor do Voxa está rodando e tente de novo.",
    soundsTitle: "Sons",
    soundsHint: "Tons suaves para a sua vez, as pistas e o XP. Nunca por cima da voz do tutor.",
    on: "Ligado",
    off: "Desligado",
  },
};

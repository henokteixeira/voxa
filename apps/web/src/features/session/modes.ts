import { MODES, type Mode } from "@/lib/api";
import { type Copy, useCopy } from "@/lib/i18n/locale";

export interface ModeInfo {
  title: string;
  /** About how long a session takes, as shown on its tile. */
  length: string;
}

export const MODE_INFO: Record<Mode, ModeInfo> = {
  free_talk: { title: "Free conversation", length: "About 5 min" },
  my_day: { title: "Talk about your day", length: "About 6 min" },
  story: { title: "Tell a story", length: "About 6 min" },
  opinion: { title: "Give your opinion", length: "About 6 min" },
  presentation: { title: "Present your project", length: "About 8 min" },
  daily: { title: "Daily stand-up", length: "About 6 min" },
  review: { title: "Sprint review", length: "About 10 min" },
  placement: { title: "Find your speaking level", length: "About 7 min" },
};

const MODE_TEXT: Copy<Record<Mode, ModeInfo>> = {
  en: MODE_INFO,
  "pt-BR": {
    free_talk: { title: "Conversa livre", length: "Cerca de 5 min" },
    my_day: { title: "Falar do seu dia", length: "Cerca de 6 min" },
    story: { title: "Contar uma história", length: "Cerca de 6 min" },
    opinion: { title: "Dar sua opinião", length: "Cerca de 6 min" },
    presentation: { title: "Apresentar seu projeto", length: "Cerca de 8 min" },
    daily: { title: "Daily stand-up", length: "Cerca de 6 min" },
    review: { title: "Sprint review", length: "Cerca de 10 min" },
    placement: { title: "Descobrir seu nível de fala", length: "Cerca de 7 min" },
  },
};

/** Each mode's title and length in the interface language. */
export function useModeInfo(): Record<Mode, ModeInfo> {
  return useCopy(MODE_TEXT);
}

export function isMode(value: string | undefined): value is Mode {
  return MODES.includes(value as Mode);
}

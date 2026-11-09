import { MODES, type Mode } from "@/lib/api";
import { type Copy, useCopy } from "@/lib/i18n/locale";

export interface ModeInfo {
  title: string;
  /** Who the tutor plays, and about how long. */
  meta: string;
  color: string;
}

/** About how long a mode takes, from its meta ("Friend · about 6 min" → "About 6 min"), for the short tiles. */
export function lengthOf(info: Pick<ModeInfo, "meta">): string {
  const length = info.meta.split(" · ").pop() ?? info.meta;
  return length.charAt(0).toUpperCase() + length.slice(1);
}

export const MODE_INFO: Record<Mode, ModeInfo> = {
  free_talk: { title: "Free conversation", meta: "Colleague · about 5 min", color: "var(--color-lilac)" },
  my_day: { title: "Talk about your day", meta: "Friend · about 6 min", color: "var(--color-honey)" },
  story: { title: "Tell a story", meta: "Friend · about 6 min", color: "var(--color-apricot)" },
  opinion: { title: "Give your opinion", meta: "Friend · about 6 min", color: "var(--color-sage)" },
  presentation: { title: "Present your project", meta: "Sponsor · about 8 min", color: "var(--color-apricot)" },
  daily: { title: "Daily stand-up", meta: "Tech lead · about 6 min", color: "var(--color-mist)" },
  review: { title: "Sprint review", meta: "Product owner · about 10 min", color: "var(--color-sage)" },
  placement: { title: "Find your speaking level", meta: "Interviewer · about 7 min", color: "var(--color-honey)" },
};

type ModeText = Omit<ModeInfo, "color">;

const MODE_COLOR = (mode: Mode) => MODE_INFO[mode].color;

const MODE_TEXT: Copy<Record<Mode, ModeText>> = {
  en: MODE_INFO,
  "pt-BR": {
    free_talk: { title: "Conversa livre", meta: "Colega · cerca de 5 min" },
    my_day: { title: "Falar do seu dia", meta: "Amigo · cerca de 6 min" },
    story: { title: "Contar uma história", meta: "Amigo · cerca de 6 min" },
    opinion: { title: "Dar sua opinião", meta: "Amigo · cerca de 6 min" },
    presentation: { title: "Apresentar seu projeto", meta: "Patrocinador · cerca de 8 min" },
    daily: { title: "Daily stand-up", meta: "Tech lead · cerca de 6 min" },
    review: { title: "Sprint review", meta: "Product owner · cerca de 10 min" },
    placement: { title: "Descobrir seu nível de fala", meta: "Entrevista · cerca de 7 min" },
  },
};

/** Each mode's title and details in the interface language. */
export function useModeInfo(): Record<Mode, ModeInfo> {
  const text = useCopy(MODE_TEXT);
  return Object.fromEntries(MODES.map((m) => [m, { ...text[m], color: MODE_COLOR(m) }])) as Record<Mode, ModeInfo>;
}

export function isMode(value: string | undefined): value is Mode {
  return MODES.includes(value as Mode);
}

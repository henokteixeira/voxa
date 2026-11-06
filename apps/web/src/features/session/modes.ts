import { MODES, type Mode } from "@/lib/api";

export interface ModeInfo {
  title: string;
  /** Who the tutor plays, and about how long. */
  meta: string;
  color: string;
  /** The real-life meeting it trains for, as in "a real daily". */
  meeting: string;
}

export const MODE_INFO: Record<Mode, ModeInfo> = {
  presentation: { title: "Present your project", meta: "Sponsor · about 8 min", color: "var(--color-apricot)", meeting: "project presentation" },
  free_talk: { title: "Catch up with a colleague", meta: "Colleague · about 5 min", color: "var(--color-lilac)", meeting: "chat with a colleague" },
  daily: { title: "Daily stand-up", meta: "Tech lead · about 6 min", color: "var(--color-mist)", meeting: "daily" },
  review: { title: "Sprint review", meta: "Product owner · about 10 min", color: "var(--color-sage)", meeting: "sprint review" },
};

export function isMode(value: string | undefined): value is Mode {
  return MODES.includes(value as Mode);
}

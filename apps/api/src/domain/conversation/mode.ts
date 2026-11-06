export const MODES = ["presentation", "free_talk", "daily", "review"] as const;

export type Mode = (typeof MODES)[number];

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

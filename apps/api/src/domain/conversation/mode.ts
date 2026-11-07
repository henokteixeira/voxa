/** The meeting modes, plus `placement`: the speaking-level interview (it never corrects, it only observes). */
export const MODES = ["presentation", "free_talk", "daily", "review", "placement"] as const;

export type Mode = (typeof MODES)[number];

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

/** The placement interview observes the learner: no hints, no practice targets. */
export function correctsMistakes(mode: Mode): boolean {
  return mode !== "placement";
}

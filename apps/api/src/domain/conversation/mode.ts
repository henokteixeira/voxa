/**
 * The practice modes (everyday conversations and work meetings), plus `placement`: the speaking-level
 * interview (it never corrects, it only observes).
 */
export const MODES = ["free_talk", "my_day", "story", "opinion", "presentation", "daily", "review", "placement"] as const;

export type Mode = (typeof MODES)[number];

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

/** The placement interview observes the learner: no hints, no practice targets. */
export function correctsMistakes(mode: Mode): boolean {
  return mode !== "placement";
}

/** The placement interview's tasks are steps of the interview, not practice goals: covering them earns no XP. */
export function rewardsGoals(mode: Mode): boolean {
  return mode !== "placement";
}

/** "Say it faster" retells a practice conversation; the placement interview is not practice. */
export function hasFasterRounds(mode: Mode): boolean {
  return mode !== "placement";
}

/**
 * The session modes: the practice categories (everyday conversations and work meetings), plus `placement`,
 * the speaking-level interview (it never corrects, it only observes).
 */
export const MODES = ["free_talk", "my_day", "story", "opinion", "presentation", "daily", "review", "placement"] as const;
export type Mode = (typeof MODES)[number];

/** The speaking levels (CEFR). */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

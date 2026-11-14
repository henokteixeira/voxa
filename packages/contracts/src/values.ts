/** The value lists the API and the web app both use. */

/** The stages of the step-by-step script (A1–B1): one answer per goal, then putting it all together. */
export const TRACK_STAGES = ["answer", "retell"] as const;
export type TrackStage = (typeof TRACK_STAGES)[number];

/** The words the script gives for an answer, from most to least: an example to change, a sentence to complete, a start, none. */
export const TRACK_SUPPORTS = ["example", "frame", "start", "alone"] as const;
export type TrackSupport = (typeof TRACK_SUPPORTS)[number];

/** How a level was set: the placement session, the learner by hand, or a step change they confirmed. */
export const LEVEL_SOURCES = ["placement", "manual", "step_change"] as const;
export type LevelSource = (typeof LEVEL_SOURCES)[number];

/**
 * The daily mission steps whose end the learner marks; the task is read from the session. "Say it faster" is done by
 * its rounds, or marked when the learner skips it (it is optional since 2026-11-13).
 */
export const MARKED_STEPS = ["listen", "expressions", "faster", "review"] as const;
export type MarkedStep = (typeof MARKED_STEPS)[number];

/** Why the learner says a record is not a mistake. */
export const DISMISS_REASONS = ["transcript_error", "both_correct", "not_needed"] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

/** Where a mistake stands: new or made again, used correctly since, or used correctly for long enough. */
export const MISTAKE_STATUSES = ["open", "improving", "mastered"] as const;
export type MistakeStatus = (typeof MISTAKE_STATUSES)[number];

/** What a review asks for: a pattern from the bank, a new word, or an expression from a daily mission. */
export const REVIEW_SUBJECT_KINDS = ["pattern", "new_word", "expression"] as const;
export type ReviewSubjectKind = (typeof REVIEW_SUBJECT_KINDS)[number];

/** How long the learner wants to practice each day (minutes). */
export const DAILY_MINUTES = [15, 30, 45, 60] as const;
export type DailyMinutes = (typeof DAILY_MINUTES)[number];

/** What earns XP. */
export const XP_REASONS = ["practice_minute", "goal_covered", "self_corrected", "personal_record"] as const;
export type XpReason = (typeof XP_REASONS)[number];

/** What a fact about the learner is about. Speaking practice covers life in general, not only work. */
export const FACT_TOPICS = ["work", "projects", "people", "interests", "life", "goals"] as const;
export type FactTopic = (typeof FACT_TOPICS)[number];

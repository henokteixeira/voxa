import { z } from "zod";
import { CEFR_LEVELS } from "./modes.js";
import { Language } from "./sessions.js";
import { DAILY_MINUTES, DISMISS_REASONS, REVIEW_SUBJECT_KINDS } from "./values.js";

/** Whether the runtime knows the IANA time zone (e.g. "America/Sao_Paulo"). */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** An IANA time zone (e.g. "America/Sao_Paulo"): days, the goal and the streak follow the learner's clock. */
export const TimeZone = z.string().max(64).refine(isTimeZone, "Unknown time zone.");

/** PUT /level: the learner corrects the estimated level by hand. */
export const SetLevelBody = z.object({ language: Language, level: z.enum(CEFR_LEVELS) });
/** POST /level/step-change: the learner confirms the proposed step change (`to` is the proposed level). */
export const StepChangeBody = z.object({ language: Language, to: z.enum(CEFR_LEVELS) });

/** PUT /progress/daily-goal */
export const DailyGoalBody = z.object({
  language: Language,
  timeZone: TimeZone,
  minutesPerDay: z.union(DAILY_MINUTES.map((minutes) => z.literal(minutes))),
});

/** POST /reviews/cards: the cue for one item. */
export const ReviewCardBody = z.object({ subject: z.object({ kind: z.enum(REVIEW_SUBJECT_KINDS), id: z.uuid() }) });
/** POST /reviews/answers */
export const ReviewAnswerBody = z.object({
  cardId: z.uuid(),
  /** What the learner said; null when they chose "I don't know". */
  utterance: z.string().max(2000).nullable(),
  /** The learner's time zone: an item earns XP once per local day. */
  timeZone: TimeZone,
  /** From the cue showing to the learner starting to speak; missing or null for a typed answer. */
  startDelayMs: z.number().int().min(0).max(600_000).nullable().optional(),
});

/** POST /missions/:id/steps/:step */
export const MissionStepBody = z.object({ timeZone: TimeZone });
/** POST /missions/:id/expressions/:expressionId/attempts */
export const ExpressionAttemptBody = z.object({ utterance: z.string().trim().min(1).max(2000) });

/** POST /mistakes/:id/dismiss */
export const DismissMistakeBody = z.object({ reason: z.enum(DISMISS_REASONS) });

/** A fact about the learner, at most this long. */
export const MAX_FACT_LENGTH = 200;
/** PATCH /memory/facts/:id. Same shape as the facts the tutor saves: one line, single spaces. */
export const EditFactBody = z.object({
  statement: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(1).max(MAX_FACT_LENGTH)),
});

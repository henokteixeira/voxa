import { wordsPerMinute } from "../conversation/fluency.js";

/**
 * The check-in every 2 weeks: always the same task, 2 minutes, no help and no corrections, compared with
 * the earlier ones. The recording is kept so the learner can hear before and after.
 */

/** The fixed task (its wording lives in the web app's copy). */
export const CHECK_IN_TASK = "present_project";
export const CHECK_IN_INTERVAL_DAYS = 14;
export const CHECK_IN_LIMIT_MS = 120_000;

/** One stored check-in, without its recording. */
export interface CheckIn {
  id: string;
  language: string;
  task: string;
  recordedAt: Date;
  transcript: string;
  spokenWords: number;
  /** Time the learner spoke, from the first word to the last. */
  speechMs: number;
  /** Silences of at least 1 s inside it. */
  longPauses: number;
  /** Mistakes the tutor found reading the transcript afterwards (none are shown during it); null when it couldn't read it. */
  mistakes: number | null;
  /** Words said in another language than the check-in's; null when it couldn't read it. */
  otherLanguageWords: number | null;
}

export interface CheckInPace {
  id: string;
  recordedAt: Date;
  wordsPerMinute: number | null;
  longPauses: number;
  /** Rounded to one decimal; null when the transcript was not read or has no words. */
  mistakesPer100Words: number | null;
  otherLanguageWords: number | null;
}

export function checkInPace(checkIn: CheckIn): CheckInPace {
  return {
    id: checkIn.id,
    recordedAt: checkIn.recordedAt,
    wordsPerMinute: wordsPerMinute(checkIn.spokenWords, checkIn.speechMs),
    longPauses: checkIn.longPauses,
    mistakesPer100Words:
      checkIn.mistakes === null || checkIn.spokenWords === 0
        ? null
        : Math.round((checkIn.mistakes / checkIn.spokenWords) * 1000) / 10,
    otherLanguageWords: checkIn.otherLanguageWords,
  };
}

/** When the next check-in is due: now when there is none yet, else 2 weeks after the last one. */
export function checkInDueAt(lastRecordedAt: Date | null, now: Date): Date {
  if (!lastRecordedAt) return now;
  return new Date(lastRecordedAt.getTime() + CHECK_IN_INTERVAL_DAYS * 86_400_000);
}

import { wordsPerMinute } from "../conversation/fluency.js";
import { linkingWordsPer100 } from "./linking-words.js";

/**
 * The check-in every 2 weeks: always the same task, 2 minutes, no help and no corrections, compared with
 * the earlier ones. The recording is kept so the learner can hear before and after. Right after it comes a
 * second task of 1 minute on a topic never given before, to measure speech that was not rehearsed: it is
 * compared only with the earlier topic tasks.
 */

/** The fixed task (its wording lives in the web app's copy). */
export const CHECK_IN_TASK = "present_project";
export const CHECK_IN_INTERVAL_DAYS = 14;
export const CHECK_IN_LIMIT_MS = 120_000;

/** The second task's topics, given in this order, each once; then the one given longest ago again. Wording in the web app. */
export const CHECK_IN_TOPICS = [
  "last_weekend",
  "problem_solved",
  "explain_skill",
  "change_wanted",
  "place_remembered",
  "person_admired",
  "next_month",
  "recommendation",
  "childhood_memory",
  "hard_decision",
] as const;
export type CheckInTopic = (typeof CHECK_IN_TOPICS)[number];
export const CHECK_IN_TOPIC_LIMIT_MS = 60_000;
/** The topic task is offered right after the fixed one; skipped for longer than this, it waits for the next check-in. */
export const CHECK_IN_TOPIC_WINDOW_MS = 24 * 3_600_000;

/** The fixed task, compared over time, or the topic task, new each time. */
export type CheckInKind = "benchmark" | "topic";

export function checkInKind(task: string): CheckInKind {
  return task === CHECK_IN_TASK ? "benchmark" : "topic";
}

export function isCheckInTopic(task: string): task is CheckInTopic {
  return (CHECK_IN_TOPICS as readonly string[]).includes(task);
}

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
  task: string;
  recordedAt: Date;
  wordsPerMinute: number | null;
  longPauses: number;
  /** Rounded to one decimal; null when the transcript was not read or has no words. */
  mistakesPer100Words: number | null;
  otherLanguageWords: number | null;
  /** Words that link ideas (because, but, although...) per 100 words; null for a language without a list or no words. */
  linkingWordsPer100: number | null;
}

export function checkInPace(checkIn: CheckIn): CheckInPace {
  return {
    id: checkIn.id,
    task: checkIn.task,
    recordedAt: checkIn.recordedAt,
    wordsPerMinute: wordsPerMinute(checkIn.spokenWords, checkIn.speechMs),
    longPauses: checkIn.longPauses,
    mistakesPer100Words:
      checkIn.mistakes === null || checkIn.spokenWords === 0
        ? null
        : Math.round((checkIn.mistakes / checkIn.spokenWords) * 1000) / 10,
    otherLanguageWords: checkIn.otherLanguageWords,
    linkingWordsPer100: linkingWordsPer100(checkIn.transcript, checkIn.language, checkIn.spokenWords),
  };
}

/** When the next check-in is due: now when there is none yet, else 2 weeks after the last one. */
export function checkInDueAt(lastRecordedAt: Date | null, now: Date): Date {
  if (!lastRecordedAt) return now;
  return new Date(lastRecordedAt.getTime() + CHECK_IN_INTERVAL_DAYS * 86_400_000);
}

/** The next topic: the first never given, else the one given longest ago. `given` is the topic tasks, newest first. */
export function nextCheckInTopic(given: readonly string[]): CheckInTopic {
  const unused = CHECK_IN_TOPICS.find((topic) => !given.includes(topic));
  if (unused) return unused;
  const oldest = [...given].reverse().find(isCheckInTopic);
  return oldest ?? CHECK_IN_TOPICS[0];
}

/**
 * Whether the topic task is due: the last fixed check-in is recent (within the window) and has no topic task after it.
 * `checkIns` is every check-in of the language, newest first.
 */
export function topicTaskDue(checkIns: readonly Pick<CheckIn, "task" | "recordedAt">[], now: Date): boolean {
  const [latest] = checkIns;
  if (!latest || checkInKind(latest.task) !== "benchmark") return false;
  return now.getTime() - latest.recordedAt.getTime() <= CHECK_IN_TOPIC_WINDOW_MS;
}

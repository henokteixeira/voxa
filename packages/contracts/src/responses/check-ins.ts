import type { CHECK_IN_TASK } from "../check-ins.js";

/** One check-in's pace, as listed and compared. */
export interface CheckInPace {
  id: string;
  /** "present_project" (the fixed task) or the topic of the second task. Missing from older APIs. */
  task?: string;
  recordedAt: string;
  wordsPerMinute: number | null;
  longPauses: number;
  /** Mistakes the tutor found reading the transcript afterwards; null when it couldn't read it. */
  mistakesPer100Words: number | null;
  /** Words said in Portuguese (another language); null when the transcript wasn't read. */
  otherLanguageWords: number | null;
  /** Words that link ideas (because, but, although…) per 100 words; null for a language without a list. Missing from older APIs. */
  linkingWordsPer100?: number | null;
}

export interface CheckInOverview {
  task: typeof CHECK_IN_TASK;
  limitMs: number;
  dueAt: string;
  due: boolean;
  /** The second task, right after the fixed one: 1 minute on a topic never given before. Missing from older APIs. */
  topic?: { task: string; limitMs: number; due: boolean };
  /** The fixed task's check-ins, newest first. */
  checkIns: CheckInPace[];
}

/** A check-in and the one before it (null the first time). */
export interface CheckInResult {
  checkIn: CheckInPace & { transcript: string };
  previous: CheckInPace | null;
}

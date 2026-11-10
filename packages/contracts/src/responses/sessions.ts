import type { Mode } from "../modes.js";
import type { TrackStage } from "../values.js";
import type { SpeakingLevel } from "./levels.js";
import type { SessionXp } from "./progress.js";

/** Where the learner is in the guided track: the stage, as "step 2 of 5". */
export interface TrackView {
  stage: TrackStage;
  number: number;
  total: number;
}

/** The guided track and the words the tutor gave for the next turn. Missing from servers older than them. */
export interface Guidance {
  /** Null outside the guided track. */
  track?: TrackView | null;
  /** A model sentence, or a sentence start when stuck; null when there are no words to say. */
  scaffold?: string | null;
}

export interface StartedSession extends Guidance {
  sessionId: string;
  mode: Mode;
  language: string;
  message: string;
  /** Goals of the session, in order; empty in free talk. */
  goals: string[];
}

/** An open session as the server keeps it, to pick it up again after a reload. */
export interface ResumedSession extends Guidance {
  sessionId: string;
  mode: Mode;
  language: string;
  startedAt: string;
  turns: { role: "user" | "assistant"; content: string }[];
  goals: string[];
  coveredGoals: string[];
  /** The pending correction's hint step, without the correction. */
  hint: { hintsGiven: number; revealed: boolean; mistake?: string; mistakeType?: string; rule?: { name: string; rule: string } | null } | null;
}

export interface TurnResult extends Guidance {
  kind: "reply" | "hint" | "reveal";
  message: string;
  selfCorrected: boolean;
  /** Written help in the learner's first language, shown on screen and never spoken. */
  support?: string | null;
  /** On a hint: the learner's words that hold the mistake (never the correction). */
  mistake?: string | null;
  /** On a hint or the correct form: the mistake's type (e.g. verb_tense). Missing from older servers. */
  mistakeType?: string | null;
  /** With the correct form only: the rule the mistake breaks, in one line. */
  rule?: { name: string; rule: string } | null;
  /** The tutor asked whether to stop or keep going. */
  checkIn?: boolean;
  /** Goals of the session covered so far. */
  coveredGoals?: string[];
}

/**
 * What the tutor adds after its reply, once it has read the learner's turn: a hint about a serious mistake
 * (spoken right after the reply), the stop-or-keep-going question, or only on-screen help and goals.
 */
export interface FollowUp extends Omit<TurnResult, "message"> {
  /** The spoken line, or null when there is nothing to say. */
  message: string | null;
}

export interface SessionMistake {
  original: string;
  correction: string;
  category: string;
  severity: "serious" | "minor";
  selfCorrected: boolean;
  occurrences: number;
  /** The pattern the mistake breaks; missing from older servers, null for new words and older mistakes. */
  pattern?: MistakePattern | null;
  patternId?: string | null;
}

/** A rule a mistake breaks: a short name and one line in the learner's first language. */
export interface MistakePattern {
  key: string;
  name: string;
  rule: string;
}

/** A pattern from the session for the learner to take away. */
export interface Takeaway {
  patternId: string;
  category: string;
  name: string;
  rule: string;
  /** The learner's words when they broke it. */
  said: string;
}

/** The fluency signals. Null when the session gave nothing to measure. */
export interface FluencySignals {
  /** 0–1: of the mistakes that got a hint, the share the learner fixed alone. */
  selfCorrectionRate: number | null;
  mistakesPer100Words: number | null;
  averagePauseMs: number | null;
  /** Words the learner spoke per minute of his own speech. */
  wordsPerMinute: number | null;
  /** Long silences inside his answers per minute of his own speech. */
  longPausesPerMinute: number | null;
  /** 0–1: share of the learner's turns said without help. Missing from servers older than it. */
  unaidedShare?: number | null;
  /** Average words in one of the learner's answers. Missing from servers older than it. */
  wordsPerAnswer?: number | null;
}

export type SignalName = keyof Required<FluencySignals>;

export type Trend = "better" | "steady" | "worse";

/** How the session compares with the learner's last sessions (up to 3), signal by signal. */
export interface SignalComparison {
  sessions: number;
  signals: { name: SignalName; current: number; baseline: number; trend: Trend }[];
}

export interface SessionSummary {
  sessionId: string;
  mode: Mode;
  mistakes: SessionMistake[];
  selfCorrections: number;
  signals: FluencySignals;
  /** Null when there is nothing to compare yet (or after a placement interview); missing from older servers. */
  comparison?: SignalComparison | null;
  goals: { id: string; covered: boolean }[];
  /** Mistakes from the bank practiced in this session; `met` when the learner said the correct form. */
  targets: { original: string; correction: string; category: string; met: boolean }[];
  /** After a placement interview: the level it gave (null when nothing was said). Missing or null otherwise. */
  level?: SpeakingLevel | null;
  /** XP the session earned; missing from servers older than XP. */
  xp?: SessionXp;
  /** Up to 3 patterns to take away; missing from older servers, empty after a placement interview. */
  takeaways?: Takeaway[];
}

/** One practice session's signals, for the Progress tab. */
export interface SignalsHistoryEntry {
  sessionId: string;
  mode: Mode;
  /** ISO 8601 date-time. */
  recordedAt: string;
  signals: Required<FluencySignals>;
}

/** One "say it faster" round: the same content told again with less time. */
export interface FasterRound {
  round: number;
  timeLimitMs: number;
  transcript: string;
  spokenWords: number;
  speechMs: number;
  longPauses: number;
}

export interface FasterRoundsView {
  /** The session's language: the rounds are told in it. */
  language: string;
  rounds: FasterRound[];
  /** The round to tell next and its time; null when the 3 are told. */
  nextRound: number | null;
  nextLimitMs: number | null;
  /** After the third round: each round's pace and how it changed from the first. */
  result: {
    rounds: { round: number; wordsPerMinute: number | null; longPauses: number }[];
    paceChangePercent: number | null;
    fewerLongPauses: boolean;
  } | null;
}

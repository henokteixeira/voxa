import { wordsPerMinute } from "../conversation/fluency.js";

/**
 * "Say it faster" (a shortened 4/3/2): after a conversation the learner tells the same content 3 times,
 * each time with less time, and with no correction. The app shows how his pace changed.
 */

/** The time of each round: 2:00, 1:30, 1:00 (rounds are numbered from 1). */
export const FASTER_ROUND_LIMITS_MS = [120_000, 90_000, 60_000] as const;
export const FASTER_ROUNDS = FASTER_ROUND_LIMITS_MS.length;

/** Speech measured a little past the limit still counts: the last turn is cut when the time runs out. */
export const FASTER_ROUND_GRACE_MS = 5_000;

/** A silence inside the learner's speech at least this long is a long pause (the same bar as the session signals). */
export const LONG_PAUSE_MS = 1_000;

/** One told round, as measured by the web app. */
export interface FasterRound {
  /** 1, 2 or 3. */
  round: number;
  timeLimitMs: number;
  /** What the learner said, from speech to text. */
  transcript: string;
  spokenWords: number;
  /** Time the learner spoke (his pauses inside a turn included). */
  speechMs: number;
  /** Silences of at least 1 s inside his speech. */
  longPauses: number;
}

export interface RoundPace {
  round: number;
  /** Null when the round had no measurable speech. */
  wordsPerMinute: number | null;
  longPauses: number;
}

/** How the pace changed from the first round to the last; null until the 3 rounds are told. */
export interface FasterResult {
  rounds: RoundPace[];
  /** How much faster the last round was than the first, in percent (negative when slower); null without both paces. */
  paceChangePercent: number | null;
  fewerLongPauses: boolean;
}

export function isFasterRound(round: number): boolean {
  return Number.isInteger(round) && round >= 1 && round <= FASTER_ROUNDS;
}

export function roundLimitMs(round: number): number {
  if (!isFasterRound(round)) throw new RangeError(`There is no round ${round} in say it faster.`);
  return FASTER_ROUND_LIMITS_MS[round - 1];
}

export function roundPace(round: Pick<FasterRound, "round" | "spokenWords" | "speechMs" | "longPauses">): RoundPace {
  return { round: round.round, wordsPerMinute: wordsPerMinute(round.spokenWords, round.speechMs), longPauses: round.longPauses };
}

/** The result of the 3 rounds (given in order), or null while some are missing. */
export function fasterResult(rounds: readonly FasterRound[]): FasterResult | null {
  if (rounds.length < FASTER_ROUNDS) return null;
  const paces = rounds.map(roundPace);
  const first = paces[0];
  const last = paces[paces.length - 1];
  const paceChangePercent =
    first.wordsPerMinute && last.wordsPerMinute !== null
      ? Math.round(((last.wordsPerMinute - first.wordsPerMinute) / first.wordsPerMinute) * 100)
      : null;
  return { rounds: paces, paceChangePercent, fewerLongPauses: last.longPauses < first.longPauses };
}

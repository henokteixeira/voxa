import { Inject, Injectable } from "@nestjs/common";
import { countWords } from "../domain/conversation/fluency.js";
import { hasFasterRounds } from "../domain/conversation/mode.js";
import { InvalidInputError } from "../domain/errors.js";
import {
  FASTER_ROUND_GRACE_MS,
  FASTER_ROUNDS,
  type FasterResult,
  type FasterRound,
  fasterResult,
  isFasterRound,
  LONG_PAUSE_MS,
  roundLimitMs,
} from "../domain/faster/faster-rounds.js";
import { xpForFasterRounds } from "../domain/progress/daily-goal.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { FASTER_ROUND_REPOSITORY, type FasterRoundRepository } from "../domain/ports/faster-round.repository.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";
import type { Session } from "../domain/conversation/types.js";
import { SessionNotFoundError } from "../domain/conversation/session-errors.js";

/** A told round as the web app sends it. */
export interface ToldRound {
  round: number;
  transcript: string;
  speechMs: number;
  /** Silences inside the learner's speech; the long ones count. */
  longPausesMs: number[];
}

export interface FasterRoundsView {
  /** The session's language: the rounds are told in it. */
  language: string;
  rounds: FasterRound[];
  /** The round to tell next, or null when the 3 are told. */
  nextRound: number | null;
  nextLimitMs: number | null;
  result: FasterResult | null;
  /** XP the rounds earned so far, already counted in today's goal. */
  xp: number;
}

/** "Say it faster": the rounds told after an ended practice session, and how the pace changed. */
@Injectable()
export class FasterRoundsService {
  constructor(
    @Inject(FASTER_ROUND_REPOSITORY) private readonly rounds: FasterRoundRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: Pick<SessionRepository, "get">,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async view(sessionId: string): Promise<FasterRoundsView> {
    const session = await this.practiceSession(sessionId);
    return this.viewOf(session);
  }

  /** Stores the next round. Sending a round already stored again (a retry) changes nothing. */
  async record(sessionId: string, told: ToldRound): Promise<FasterRoundsView> {
    const session = await this.practiceSession(sessionId);
    if (!isFasterRound(told.round)) throw new InvalidInputError(`There are ${FASTER_ROUNDS} rounds; got round ${told.round}.`);
    const stored = await this.rounds.list(sessionId);
    if (told.round > stored.length + 1) {
      throw new InvalidInputError(`Round ${told.round} comes after round ${stored.length + 1}, which was not told yet.`);
    }
    // A round sent again (a retry) keeps what was stored first.
    if (told.round <= stored.length) return this.viewOf(session);
    const timeLimitMs = roundLimitMs(told.round, session.step);
    if (told.speechMs > timeLimitMs + FASTER_ROUND_GRACE_MS) {
      throw new InvalidInputError(`Round ${told.round} has ${timeLimitMs / 1000} s; ${told.speechMs} ms of speech is too long.`);
    }
    await this.rounds.saveOnce({
      sessionId,
      language: session.language,
      round: told.round,
      timeLimitMs,
      transcript: told.transcript,
      spokenWords: countWords(told.transcript),
      speechMs: told.speechMs,
      longPauses: told.longPausesMs.filter((ms) => ms >= LONG_PAUSE_MS).length,
      recordedAt: this.clock.now(),
    });
    return this.viewOf(session);
  }

  private async viewOf(session: Pick<Session, "id" | "language" | "step">): Promise<FasterRoundsView> {
    const stored = await this.rounds.list(session.id);
    const rounds: FasterRound[] = stored.map(
      ({ round, timeLimitMs, transcript, spokenWords, speechMs, longPauses }) => ({
        round,
        timeLimitMs,
        transcript,
        spokenWords,
        speechMs,
        longPauses,
      }),
    );
    const nextRound = rounds.length < FASTER_ROUNDS ? rounds.length + 1 : null;
    return {
      language: session.language,
      rounds,
      nextRound,
      nextLimitMs: nextRound === null ? null : roundLimitMs(nextRound, session.step),
      result: fasterResult(rounds),
      xp: xpForFasterRounds(stored).reduce((sum, { total }) => sum + total, 0),
    };
  }

  /** The rounds retell an ended practice conversation. */
  private async practiceSession(sessionId: string) {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (!hasFasterRounds(session.mode)) throw new InvalidInputError("The placement interview has no say-it-faster rounds.");
    if (!session.endedAt) throw new InvalidInputError("Say it faster starts after the conversation ends.");
    return session;
  }
}

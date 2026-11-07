import { Inject, Injectable } from "@nestjs/common";
import type { Mode } from "../domain/conversation/mode.js";
import { COMPARED_SESSIONS, compareSignals, type SessionSignals, type SignalComparison } from "../domain/progress/signal-trend.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { SIGNALS_REPOSITORY, type SignalsRepository } from "../domain/ports/signals.repository.js";

/** How many sessions the Progress tab shows the signals of. */
export const SIGNAL_HISTORY = 12;

/** One session's signals as the Progress tab shows them. */
export interface SignalsHistoryEntry {
  sessionId: string;
  mode: Mode;
  recordedAt: Date;
  signals: SessionSignals;
}

/** What the session summary already knows about an ended session's signals. */
export interface EndedSessionSignals {
  sessionId: string;
  language: string;
  mode: Mode;
  signals: SessionSignals;
}

/** Keeps each practice session's signals and compares a session with the ones before it (inferred confidence). */
@Injectable()
export class SignalsService {
  constructor(
    @Inject(SIGNALS_REPOSITORY) private readonly signals: SignalsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Stores the session's signals (once: ending again keeps the first ones and the same comparison) and compares
   * them with the sessions before. Null for a placement interview, a session that measured nothing, or when
   * there is nothing to compare yet.
   */
  async recordSession(ended: EndedSessionSignals): Promise<SignalComparison | null> {
    // The interview gives no help and never corrects: its signals say nothing about practice.
    if (ended.mode === "placement") return null;
    // A session that measured nothing (ended at once) would only push real sessions out of the last ones.
    if (Object.values(ended.signals).every((value) => value === null)) return null;
    const stored = await this.signals.recordOnce({ ...ended, recordedAt: this.clock.now() });
    const earlier = await this.signals.earlierThan(stored.sessionId, COMPARED_SESSIONS);
    return compareSignals(
      stored.signals,
      earlier.map((record) => record.signals),
    );
  }

  /** The signals of the last practice sessions, oldest first, for the Progress tab. */
  async history(language: string): Promise<SignalsHistoryEntry[]> {
    const recent = await this.signals.recent(language, SIGNAL_HISTORY);
    return recent.reverse().map(({ sessionId, mode, recordedAt, signals }) => ({ sessionId, mode, recordedAt, signals }));
  }
}

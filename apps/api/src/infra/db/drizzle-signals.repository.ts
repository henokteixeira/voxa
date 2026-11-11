import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { isMode } from "../../domain/conversation/mode.js";
import type { SessionSignalsRecord, SignalsRepository } from "../../domain/ports/signals.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { LEARNER_ID, sessionsOf } from "./learner.js";
import { sessionSignals } from "./schema.js";

type SignalsRow = typeof sessionSignals.$inferSelect;

function toRecord(row: SignalsRow): SessionSignalsRecord {
  if (!isMode(row.mode)) throw new Error(`Unknown mode in the signals of session ${row.sessionId}: ${row.mode}`);
  return {
    sessionId: row.sessionId,
    language: row.language,
    mode: row.mode,
    recordedAt: row.recordedAt,
    signals: {
      unaidedShare: row.unaidedShare,
      wordsPerMinute: row.wordsPerMinute,
      longPausesPerMinute: row.longPausesPerMinute,
      averagePauseMs: row.averagePauseMs,
      mistakesPer100Words: row.mistakesPer100Words,
      selfCorrectionRate: row.selfCorrectionRate,
      wordsPerAnswer: row.wordsPerAnswer,
    },
  };
}

@Injectable()
export class DrizzleSignalsRepository implements SignalsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARNER_ID) private readonly learnerId: string,
  ) {}

  /** Signals of this learner's sessions. */
  private get mine() {
    return inArray(sessionSignals.sessionId, sessionsOf(this.db, this.learnerId));
  }

  async recordOnce({ signals, ...record }: SessionSignalsRecord): Promise<SessionSignalsRecord> {
    // Integer columns: the pace and the pause are whole numbers already, rounded again in case a caller did not.
    const wordsPerMinute = signals.wordsPerMinute === null ? null : Math.round(signals.wordsPerMinute);
    const averagePauseMs = signals.averagePauseMs === null ? null : Math.round(signals.averagePauseMs);
    await this.db
      .insert(sessionSignals)
      .values({ ...record, ...signals, wordsPerMinute, averagePauseMs })
      .onConflictDoNothing();
    const [row] = await this.db.select().from(sessionSignals).where(eq(sessionSignals.sessionId, record.sessionId));
    if (!row) throw new Error(`Signals of session ${record.sessionId} were not stored.`);
    return toRecord(row);
  }

  async earlierThan(sessionId: string, limit: number): Promise<SessionSignalsRecord[]> {
    const [own] = await this.db
      .select({ language: sessionSignals.language, seq: sessionSignals.seq })
      .from(sessionSignals)
      .where(eq(sessionSignals.sessionId, sessionId));
    if (!own) return [];
    const rows = await this.db
      .select()
      .from(sessionSignals)
      .where(and(this.mine, eq(sessionSignals.language, own.language), lt(sessionSignals.seq, own.seq)))
      .orderBy(desc(sessionSignals.seq))
      .limit(limit);
    return rows.map(toRecord);
  }

  async recent(language: string, limit: number): Promise<SessionSignalsRecord[]> {
    const rows = await this.db
      .select()
      .from(sessionSignals)
      .where(and(this.mine, eq(sessionSignals.language, language)))
      .orderBy(desc(sessionSignals.seq))
      .limit(limit);
    return rows.map(toRecord);
  }
}

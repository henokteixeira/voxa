import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { FasterRoundRecord, FasterRoundRepository } from "../../domain/ports/faster-round.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { LEARNER_ID, sessionsOf } from "./learner.js";
import { fasterRounds } from "./schema.js";

@Injectable()
export class DrizzleFasterRoundRepository implements FasterRoundRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARNER_ID) private readonly learnerId: string,
  ) {}

  async saveOnce(record: FasterRoundRecord): Promise<void> {
    await this.db.insert(fasterRounds).values(record).onConflictDoNothing();
  }

  async list(sessionId: string): Promise<FasterRoundRecord[]> {
    return this.db.select().from(fasterRounds).where(eq(fasterRounds.sessionId, sessionId)).orderBy(asc(fasterRounds.round));
  }

  async toldSince(language: string, since: Date): Promise<Pick<FasterRoundRecord, "sessionId" | "speechMs" | "recordedAt">[]> {
    return this.db
      .select({ sessionId: fasterRounds.sessionId, speechMs: fasterRounds.speechMs, recordedAt: fasterRounds.recordedAt })
      .from(fasterRounds)
      .where(
        and(
          inArray(fasterRounds.sessionId, sessionsOf(this.db, this.learnerId)),
          eq(fasterRounds.language, language),
          gte(fasterRounds.recordedAt, since),
        ),
      )
      .orderBy(asc(fasterRounds.recordedAt));
  }
}

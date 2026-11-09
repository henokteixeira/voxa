import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { FasterRoundRecord, FasterRoundRepository } from "../../domain/ports/faster-round.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { fasterRounds } from "./schema.js";

@Injectable()
export class DrizzleFasterRoundRepository implements FasterRoundRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async saveOnce(record: FasterRoundRecord): Promise<void> {
    await this.db.insert(fasterRounds).values(record).onConflictDoNothing();
  }

  async list(sessionId: string): Promise<FasterRoundRecord[]> {
    return this.db.select().from(fasterRounds).where(eq(fasterRounds.sessionId, sessionId)).orderBy(asc(fasterRounds.round));
  }
}

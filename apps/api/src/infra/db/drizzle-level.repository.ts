import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { CefrLevel, LevelSource, SpeakingLevel } from "../../domain/level/speaking-level.js";
import type { LevelRepository } from "../../domain/ports/level.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { LEARNER_ID } from "./learner.js";
import { speakingLevels } from "./schema.js";

@Injectable()
export class DrizzleLevelRepository implements LevelRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARNER_ID) private readonly learnerId: string,
  ) {}

  async add(level: SpeakingLevel): Promise<void> {
    await this.db.insert(speakingLevels).values({ ...level, learnerId: this.learnerId });
  }

  async addForSession(sessionId: string, level: SpeakingLevel): Promise<SpeakingLevel> {
    await this.db
      .insert(speakingLevels)
      .values({ ...level, sessionId, learnerId: this.learnerId })
      .onConflictDoNothing({ target: speakingLevels.sessionId });
    const stored = await this.forSession(sessionId);
    if (!stored) throw new Error(`The level of session ${sessionId} was not stored.`);
    return stored;
  }

  async forSession(sessionId: string): Promise<SpeakingLevel | null> {
    const [row] = await this.db.select().from(speakingLevels).where(eq(speakingLevels.sessionId, sessionId)).limit(1);
    return row ? toLevel(row) : null;
  }

  async current(language: string): Promise<SpeakingLevel | null> {
    const [row] = await this.db
      .select()
      .from(speakingLevels)
      .where(eq(speakingLevels.language, language))
      .orderBy(desc(speakingLevels.seq))
      .limit(1);
    return row ? toLevel(row) : null;
  }

  async lastPlacementAt(language: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ assessedAt: speakingLevels.assessedAt })
      .from(speakingLevels)
      .where(and(eq(speakingLevels.language, language), eq(speakingLevels.source, "placement")))
      .orderBy(desc(speakingLevels.seq))
      .limit(1);
    return row?.assessedAt ?? null;
  }
}

function toLevel(row: typeof speakingLevels.$inferSelect): SpeakingLevel {
  return {
    language: row.language,
    level: row.level as CefrLevel,
    source: row.source as LevelSource,
    evidence: row.evidence,
    assessedAt: row.assessedAt,
  };
}

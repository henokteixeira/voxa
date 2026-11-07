import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { CefrLevel, LevelSource, SpeakingLevel } from "../../domain/level/speaking-level.js";
import type { LevelRepository } from "../../domain/ports/level.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { speakingLevels } from "./schema.js";

@Injectable()
export class DrizzleLevelRepository implements LevelRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async add(level: SpeakingLevel): Promise<void> {
    await this.db.insert(speakingLevels).values(level);
  }

  async current(language: string): Promise<SpeakingLevel | null> {
    const [row] = await this.db
      .select()
      .from(speakingLevels)
      .where(eq(speakingLevels.language, language))
      .orderBy(desc(speakingLevels.seq))
      .limit(1);
    if (!row) return null;
    return {
      language: row.language,
      level: row.level as CefrLevel,
      source: row.source as LevelSource,
      evidence: row.evidence,
      assessedAt: row.assessedAt,
    };
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

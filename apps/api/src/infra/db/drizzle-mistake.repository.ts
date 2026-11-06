import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Mistake, MistakeRepository, NewMistake } from "../../domain/ports/mistake.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { mistakes } from "./schema.js";

@Injectable()
export class DrizzleMistakeRepository implements MistakeRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(m: NewMistake): Promise<Mistake> {
    const [existing] = await this.db
      .select()
      .from(mistakes)
      .where(and(eq(mistakes.language, m.language), eq(mistakes.original, m.original)))
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(mistakes)
        .set({ occurrences: sql`${mistakes.occurrences} + 1`, lastSeenAt: new Date(), correction: m.correction })
        .where(eq(mistakes.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await this.db.insert(mistakes).values(m).returning();
    return created;
  }

  mostFrequent(language: string, limit: number): Promise<Mistake[]> {
    return this.db
      .select()
      .from(mistakes)
      .where(eq(mistakes.language, language))
      .orderBy(desc(mistakes.occurrences), desc(mistakes.lastSeenAt))
      .limit(limit);
  }
}

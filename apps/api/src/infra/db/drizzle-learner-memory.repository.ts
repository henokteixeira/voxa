import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { isMode } from "../../domain/conversation/mode.js";
import { isFactTopic, type LearnerFact, type RecalledSession, type SessionMemory } from "../../domain/memory/learner-fact.js";
import type { LearnerMemoryRepository } from "../../domain/ports/learner-memory.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { learnerFacts, sessions } from "./schema.js";

@Injectable()
export class DrizzleLearnerMemoryRepository implements LearnerMemoryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async facts(): Promise<LearnerFact[]> {
    const rows = await this.db.select().from(learnerFacts).orderBy(asc(learnerFacts.seq));
    return rows.map(toFact);
  }

  async unremembered(limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(isNotNull(sessions.endedAt), isNull(sessions.rememberedAt)))
      .orderBy(asc(sessions.endedAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async remembered(sessionId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ rememberedAt: sessions.rememberedAt })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    return row?.rememberedAt != null;
  }

  async save(sessionId: string, language: string, memory: SessionMemory, at: Date): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // Claims the session first, so two saves at once keep one.
      const claimed = await tx
        .update(sessions)
        .set({ rememberedAt: at, recap: memory.recap })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.rememberedAt)))
        .returning({ id: sessions.id });
      if (!claimed.length) return false;
      for (const { id, statement } of memory.updated) {
        await tx
          .update(learnerFacts)
          .set({ statement, language, sourceSessionId: sessionId, updatedAt: at })
          .where(eq(learnerFacts.id, id));
      }
      if (memory.added.length) {
        await tx.insert(learnerFacts).values(
          memory.added.map((f) => ({ ...f, language, sourceSessionId: sessionId, learnedAt: at, updatedAt: at })),
        );
      }
      return true;
    });
  }

  async recentSessions(limit: number, before: Date): Promise<RecalledSession[]> {
    const rows = await this.db
      .select({ mode: sessions.mode, language: sessions.language, startedAt: sessions.startedAt, recap: sessions.recap })
      .from(sessions)
      .where(and(isNotNull(sessions.recap), lt(sessions.startedAt, before)))
      .orderBy(desc(sessions.startedAt))
      .limit(limit);
    return rows.flatMap((r) => (isMode(r.mode) && r.recap ? [{ ...r, mode: r.mode, recap: r.recap }] : []));
  }
}

function toFact(row: typeof learnerFacts.$inferSelect): LearnerFact {
  if (!isFactTopic(row.topic)) throw new Error(`Unknown topic in learner fact ${row.id}: ${row.topic}`);
  return {
    id: row.id,
    topic: row.topic,
    statement: row.statement,
    language: row.language,
    sourceSessionId: row.sourceSessionId,
    learnedAt: row.learnedAt,
    updatedAt: row.updatedAt,
  };
}

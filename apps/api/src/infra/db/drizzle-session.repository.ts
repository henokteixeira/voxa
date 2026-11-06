import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { isMode } from "../../domain/conversation/mode.js";
import type { ChatTurn, PendingCorrection, Session } from "../../domain/conversation/types.js";
import type { SessionRepository } from "../../domain/ports/session.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { sessions, turns } from "./schema.js";

type SessionRow = typeof sessions.$inferSelect;

function toSession(row: SessionRow): Session {
  if (!isMode(row.mode)) throw new Error(`Unknown mode in session ${row.id}: ${row.mode}`);
  return { id: row.id, language: row.language, mode: row.mode, pending: row.pending ?? null, endedAt: row.endedAt };
}

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(input: Pick<Session, "language" | "mode">): Promise<Session> {
    const [row] = await this.db.insert(sessions).values(input).returning();
    return toSession(row);
  }

  async get(id: string): Promise<Session | null> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return row ? toSession(row) : null;
  }

  async appendTurn(sessionId: string, turn: ChatTurn): Promise<void> {
    await this.db.insert(turns).values({ sessionId, role: turn.role, content: turn.content });
  }

  async history(sessionId: string): Promise<ChatTurn[]> {
    const rows = await this.db
      .select({ role: turns.role, content: turns.content })
      .from(turns)
      .where(eq(turns.sessionId, sessionId))
      .orderBy(asc(turns.createdAt), asc(turns.id));
    return rows.map((r) => ({ role: r.role === "user" ? "user" : "assistant", content: r.content }));
  }

  async setPending(sessionId: string, pending: PendingCorrection | null): Promise<void> {
    await this.db.update(sessions).set({ pending }).where(eq(sessions.id, sessionId));
  }

  async end(sessionId: string): Promise<void> {
    await this.db.update(sessions).set({ endedAt: new Date() }).where(eq(sessions.id, sessionId));
  }
}

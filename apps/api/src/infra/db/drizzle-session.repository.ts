import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { SessionTiming } from "../../domain/conversation/fluency.js";
import { isTrackStage, type TrackState } from "../../domain/conversation/guided-track.js";
import { isMode } from "../../domain/conversation/mode.js";
import { isSupportStep, type SupportStep } from "../../domain/level/speaking-level.js";
import type { TutorMemory } from "../../domain/memory/learner-fact.js";
import type { ChatTurn, PendingCorrection, PracticeTarget, Session } from "../../domain/conversation/types.js";
import type {
  NewTurn,
  SessionOutcome,
  SessionProgress,
  SessionRepository,
  TurnClaim,
  UnfinishedSession,
} from "../../domain/ports/session.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { sessions, sessionXp, turns } from "./schema.js";

type SessionRow = typeof sessions.$inferSelect;

function toSession(row: SessionRow): Session {
  if (!isMode(row.mode)) throw new Error(`Unknown mode in session ${row.id}: ${row.mode}`);
  if (row.supportStep !== null && !isSupportStep(row.supportStep)) {
    throw new Error(`Unknown support step in session ${row.id}: ${row.supportStep}`);
  }
  return {
    id: row.id,
    language: row.language,
    mode: row.mode,
    pending: row.pending ?? null,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    coveredGoals: row.coveredGoals,
    lastCheckInAt: row.lastCheckInAt,
    targets: row.targets,
    metTargets: row.metTargets,
    step: row.supportStep,
    scaffold: row.scaffold,
    track: toTrack(row),
    memory: row.memory,
    missionId: row.missionId,
  };
}

function toTrack(row: SessionRow): TrackState | null {
  if (row.trackStage === null) return null;
  if (!isTrackStage(row.trackStage)) throw new Error(`Unknown track stage in session ${row.id}: ${row.trackStage}`);
  return {
    stage: row.trackStage,
    goal: row.trackGoal,
    tries: row.trackTries,
    helped: row.trackHelped,
    unaidedStreak: row.trackUnaidedStreak,
    stuckStreak: row.trackStuckStreak,
  };
}

/** The track's columns; all cleared (stage null) outside the track. */
function trackColumns(track: TrackState | null) {
  return {
    trackStage: track?.stage ?? null,
    trackGoal: track?.goal ?? null,
    trackTries: track?.tries ?? 0,
    trackHelped: track?.helped ?? false,
    trackUnaidedStreak: track?.unaidedStreak ?? 0,
    trackStuckStreak: track?.stuckStreak ?? 0,
  };
}

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create({
    step,
    track,
    ...input
  }: Pick<Session, "language" | "mode"> & {
    startedAt?: Date;
    memory?: TutorMemory;
    targets?: PracticeTarget[];
    step?: SupportStep | null;
    track?: TrackState | null;
    missionId?: string | null;
  }): Promise<Session> {
    const [row] = await this.db
      .insert(sessions)
      .values({ ...input, supportStep: step ?? null, ...trackColumns(track ?? null) })
      .returning();
    return toSession(row);
  }

  async latestForMission(missionId: string): Promise<Session | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.missionId, missionId))
      .orderBy(desc(sessions.startedAt), desc(sessions.id))
      .limit(1);
    return row ? toSession(row) : null;
  }

  async get(id: string): Promise<Session | null> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return row ? toSession(row) : null;
  }

  async claimTurn(sessionId: string, turnsSeen: number): Promise<TurnClaim> {
    // The row lock waits for any other turn of this session still being saved.
    const [session] = await this.db
      .select({ endedAt: sessions.endedAt })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .for("update");
    if (!session || session.endedAt) return "ended";
    const [row] = await this.db.select({ total: count() }).from(turns).where(eq(turns.sessionId, sessionId));
    return (row?.total ?? 0) === turnsSeen ? "claimed" : "taken";
  }

  async appendTurn(sessionId: string, turn: NewTurn): Promise<void> {
    await this.db
      .insert(turns)
      .values({ sessionId, role: turn.role, content: turn.content, assisted: turn.assisted ?? false });
    await this.db.update(sessions).set({ lastActiveAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  async history(sessionId: string): Promise<ChatTurn[]> {
    const rows = await this.db
      .select({ role: turns.role, content: turns.content })
      .from(turns)
      .where(eq(turns.sessionId, sessionId))
      .orderBy(asc(turns.seq));
    return rows.map((r) => ({ role: r.role === "user" ? "user" : "assistant", content: r.content }));
  }

  async setPending(sessionId: string, pending: PendingCorrection | null): Promise<void> {
    await this.db.update(sessions).set({ pending }).where(eq(sessions.id, sessionId));
  }

  async setProgress(sessionId: string, { step, track, ...progress }: SessionProgress): Promise<void> {
    await this.db
      .update(sessions)
      .set({ ...progress, supportStep: step, ...trackColumns(track) })
      .where(eq(sessions.id, sessionId));
  }

  async saveTiming(sessionId: string, timing: SessionTiming): Promise<boolean> {
    const saved = await this.db
      .update(sessions)
      .set({ timing, lastActiveAt: new Date() })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.endedAt)))
      .returning({ id: sessions.id });
    return saved.length > 0;
  }

  async unfinished(query: {
    idleBefore: Date;
    endedAfter: Date;
    limit: number;
    after?: UnfinishedSession;
  }): Promise<UnfinishedSession[]> {
    const endsAt = sql<Date>`coalesce(${sessions.endedAt}, ${sessions.lastActiveAt})`;
    const rows = await this.db
      .select({ id: sessions.id, endsAt: sql<Date | string>`${endsAt}` })
      .from(sessions)
      .leftJoin(sessionXp, eq(sessionXp.sessionId, sessions.id))
      .where(
        and(
          or(
            and(isNull(sessions.endedAt), lt(sessions.lastActiveAt, query.idleBefore)),
            and(
              isNull(sessionXp.sessionId),
              gt(sessions.endedAt, query.endedAfter),
              lt(sessions.endedAt, query.idleBefore),
            ),
          ),
          query.after && sql`(${endsAt}, ${sessions.id}) > (${query.after.endsAt.toISOString()}::timestamptz, ${query.after.id}::uuid)`,
        ),
      )
      .orderBy(asc(endsAt), asc(sessions.id))
      .limit(query.limit);
    return rows.map((row) => ({ id: row.id, endsAt: new Date(row.endsAt) }));
  }

  async end(sessionId: string, timing: SessionTiming | null, endedAt = new Date()): Promise<void> {
    await this.db
      .update(sessions)
      // Without a timing, the one saved during the session stays.
      .set({ endedAt, ...(timing && { timing }) })
      .where(eq(sessions.id, sessionId));
  }

  async outcome(sessionId: string): Promise<SessionOutcome | null> {
    const [row] = await this.db
      .select({ timing: sessions.timing })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!row) return null;
    const [learnerTurns] = await this.db
      .select({ total: count(), assisted: count(sql`case when ${turns.assisted} then 1 end`) })
      .from(turns)
      .where(and(eq(turns.sessionId, sessionId), eq(turns.role, "user")));
    return {
      timing: row.timing ?? null,
      learnerTurns: learnerTurns ?? { total: 0, assisted: 0 },
    };
  }
}

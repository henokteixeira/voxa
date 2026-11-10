import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lt, ne, type SQL } from "drizzle-orm";
import { CHECK_IN_TASK, type CheckIn, type CheckInKind, checkInKind } from "../../domain/check-in/check-in.js";
import type { CheckInRecording, CheckInRepository } from "../../domain/ports/check-in.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { checkInRecordings, checkIns } from "./schema.js";

const toCheckIn = ({ seq: _seq, ...row }: typeof checkIns.$inferSelect): CheckIn => row;
const ofKind = (kind: CheckInKind): SQL => (kind === "benchmark" ? eq(checkIns.task, CHECK_IN_TASK) : ne(checkIns.task, CHECK_IN_TASK));

@Injectable()
export class DrizzleCheckInRepository implements CheckInRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(checkIn: Omit<CheckIn, "id">, recording: CheckInRecording): Promise<CheckIn> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(checkIns).values(checkIn).returning();
      await tx.insert(checkInRecordings).values({ checkInId: row.id, ...recording });
      return toCheckIn(row);
    });
  }

  async get(id: string): Promise<CheckIn | null> {
    const [row] = await this.db.select().from(checkIns).where(eq(checkIns.id, id));
    return row ? toCheckIn(row) : null;
  }

  async list(language: string, { limit, kind }: { limit?: number; kind?: CheckInKind } = {}): Promise<CheckIn[]> {
    const query = this.db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.language, language), kind ? ofKind(kind) : undefined))
      .orderBy(desc(checkIns.seq));
    return (await (limit === undefined ? query : query.limit(limit))).map(toCheckIn);
  }

  async previous(id: string): Promise<CheckIn | null> {
    const [own] = await this.db
      .select({ language: checkIns.language, seq: checkIns.seq, task: checkIns.task })
      .from(checkIns)
      .where(eq(checkIns.id, id));
    if (!own) return null;
    const [row] = await this.db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.language, own.language), ofKind(checkInKind(own.task)), lt(checkIns.seq, own.seq)))
      .orderBy(desc(checkIns.seq))
      .limit(1);
    return row ? toCheckIn(row) : null;
  }

  async recording(id: string): Promise<CheckInRecording | null> {
    const [row] = await this.db
      .select({ mimeType: checkInRecordings.mimeType, audio: checkInRecordings.audio })
      .from(checkInRecordings)
      .where(eq(checkInRecordings.checkInId, id));
    return row ?? null;
  }
}

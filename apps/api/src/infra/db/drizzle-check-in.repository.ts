import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import type { CheckIn } from "../../domain/check-in/check-in.js";
import type { CheckInRecording, CheckInRepository } from "../../domain/ports/check-in.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { checkInRecordings, checkIns } from "./schema.js";

const toCheckIn = ({ seq: _seq, ...row }: typeof checkIns.$inferSelect): CheckIn => row;

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

  async list(language: string): Promise<CheckIn[]> {
    const rows = await this.db.select().from(checkIns).where(eq(checkIns.language, language)).orderBy(desc(checkIns.seq));
    return rows.map(toCheckIn);
  }

  async recording(id: string): Promise<CheckInRecording | null> {
    const [row] = await this.db
      .select({ mimeType: checkInRecordings.mimeType, audio: checkInRecordings.audio })
      .from(checkInRecordings)
      .where(eq(checkInRecordings.checkInId, id));
    return row ?? null;
  }
}

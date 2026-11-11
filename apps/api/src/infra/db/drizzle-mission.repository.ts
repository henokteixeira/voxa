import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNull, lt } from "drizzle-orm";
import { isMissionSituation, type MarkedStep, type Mission, type MissionModel, type NewMissionModel } from "../../domain/mission/mission.js";
import type { MissionRepository, NewMission } from "../../domain/ports/mission.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { LEARNER_ID } from "./learner.js";
import { missionExpressions, missions } from "./schema.js";

type MissionRow = typeof missions.$inferSelect;

const STEP_COLUMNS = { listen: "listenedAt", expressions: "expressionsDoneAt", review: "reviewDoneAt" } as const satisfies Record<
  MarkedStep,
  keyof MissionRow
>;

@Injectable()
export class DrizzleMissionRepository implements MissionRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARNER_ID) private readonly learnerId: string,
  ) {}

  async create(mission: NewMission): Promise<Mission> {
    await this.db.insert(missions)
      .values({ ...mission, learnerId: this.learnerId })
      .onConflictDoNothing({ target: [missions.learnerId, missions.language, missions.day] });
    const created = await this.forDay(mission.language, mission.day);
    if (!created) throw new Error(`The mission for ${mission.day} was not stored.`);
    return created;
  }

  async forDay(language: string, day: string): Promise<Mission | null> {
    const [row] = await this.db
      .select()
      .from(missions)
      .where(and(eq(missions.language, language), eq(missions.day, day)));
    return row ? this.toMission(row) : null;
  }

  async latestBefore(language: string, day: string): Promise<Mission | null> {
    const [row] = await this.db
      .select()
      .from(missions)
      .where(and(eq(missions.language, language), lt(missions.day, day)))
      .orderBy(desc(missions.day))
      .limit(1);
    return row ? this.toMission(row) : null;
  }

  async get(id: string): Promise<Mission | null> {
    const [row] = await this.db.select().from(missions).where(eq(missions.id, id));
    return row ? this.toMission(row) : null;
  }

  async saveModel(id: string, model: NewMissionModel): Promise<MissionModel> {
    await this.db.transaction(async (tx) => {
      const saved = await tx
        .update(missions)
        .set({ modelSpeaker: model.speaker, modelText: model.text })
        .where(and(eq(missions.id, id), isNull(missions.modelText)))
        .returning({ id: missions.id });
      if (saved.length === 0) return;
      await tx.insert(missionExpressions).values(model.expressions.map((e) => ({ missionId: id, ...e })));
    });
    const kept = await this.get(id);
    if (!kept?.model) throw new Error(`The model of mission ${id} was not stored.`);
    return kept.model;
  }

  async markStep(id: string, step: MarkedStep, at: Date): Promise<void> {
    const column = STEP_COLUMNS[step];
    await this.db
      .update(missions)
      .set({ [column]: at })
      .where(and(eq(missions.id, id), isNull(missions[column])));
  }

  async markSaid(expressionId: string, at: Date): Promise<boolean> {
    const marked = await this.db
      .update(missionExpressions)
      .set({ saidAt: at })
      .where(and(eq(missionExpressions.id, expressionId), isNull(missionExpressions.saidAt)))
      .returning({ id: missionExpressions.id });
    return marked.length > 0;
  }

  private async toMission(row: MissionRow): Promise<Mission> {
    if (!isMissionSituation(row.situation)) throw new Error(`Mission ${row.id} has an unknown situation: ${row.situation}.`);
    const { modelSpeaker, modelText, ...mission } = row;
    if (modelSpeaker === null || modelText === null) return { ...mission, situation: row.situation, model: null };
    const expressions = await this.db
      .select({
        id: missionExpressions.id,
        position: missionExpressions.position,
        phrase: missionExpressions.phrase,
        example: missionExpressions.example,
        saidAt: missionExpressions.saidAt,
      })
      .from(missionExpressions)
      .where(eq(missionExpressions.missionId, row.id))
      .orderBy(asc(missionExpressions.position));
    return { ...mission, situation: row.situation, model: { speaker: modelSpeaker, text: modelText, expressions } };
  }
}

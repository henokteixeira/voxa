import { describe, expect, it, vi } from "vitest";
import type { SpeakingLevel } from "../domain/level/speaking-level.js";
import type { MarkedStep, Mission, MissionModel, NewMissionModel } from "../domain/mission/mission.js";
import type { LevelRepository } from "../domain/ports/level.repository.js";
import type { MissionRepository, NewMission } from "../domain/ports/mission.repository.js";
import { InvalidInputError } from "../domain/errors.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";
import { MissionExpressionNotFoundError, MissionNotFoundError, MissionService } from "./mission.service.js";
import type { ReviewScheduler } from "./review-scheduler.js";

class FakeMissions implements MissionRepository {
  rows: Mission[] = [];
  async create(mission: NewMission) {
    const existing = await this.forDay(mission.language, mission.day);
    if (existing) return existing;
    const row: Mission = { ...mission, id: `m${this.rows.length + 1}`, model: null, listenedAt: null, expressionsDoneAt: null, reviewDoneAt: null, fasterSkippedAt: null };
    this.rows.push(row);
    return row;
  }
  async forDay(language: string, day: string) {
    return this.rows.find((m) => m.language === language && m.day === day) ?? null;
  }
  async latestBefore(language: string, day: string) {
    return this.rows.filter((m) => m.language === language && m.day < day).sort((a, b) => b.day.localeCompare(a.day))[0] ?? null;
  }
  async get(id: string) {
    return this.rows.find((m) => m.id === id) ?? null;
  }
  async saveModel(id: string, model: NewMissionModel) {
    const row = this.rows.find((m) => m.id === id)!;
    row.model ??= stored(id, model);
    return row.model;
  }
  async markStep(id: string, step: MarkedStep, at: Date) {
    const row = this.rows.find((m) => m.id === id)!;
    const key = ({ listen: "listenedAt", expressions: "expressionsDoneAt", faster: "fasterSkippedAt", review: "reviewDoneAt" } as const)[step];
    row[key] ??= at;
  }
  async markSaid(expressionId: string, at: Date) {
    const expression = this.rows.flatMap((m) => m.model?.expressions ?? []).find((e) => e.id === expressionId);
    if (!expression || expression.saidAt) return false;
    expression.saidAt = at;
    return true;
  }
}

const model: NewMissionModel = {
  speaker: "Alex",
  text: "Yesterday I fixed the login bug.",
  expressions: [1, 2, 3].map((position) => ({ position, phrase: `Phrase ${position}…`, example: `Example ${position}.` })),
};
function stored(id: string, written = model): MissionModel {
  return { ...written, expressions: written.expressions.map((e) => ({ ...e, id: `${id}-e${e.position}`, saidAt: null })) };
}

function setup(level: SpeakingLevel["level"] | null = "A2") {
  const clock = { at: new Date("2026-11-09T12:00:00Z"), now: () => clock.at };
  const missions = new FakeMissions();
  const coach = { model: vi.fn().mockResolvedValue(model), usedExpression: vi.fn().mockResolvedValue(true) };
  const reviews = { learned: vi.fn() };
  const levels = {
    current: async () => (level ? { language: "en", level, source: "manual", evidence: [], assessedAt: clock.at } : null),
  } as unknown as LevelRepository;
  const tts = { synthesize: vi.fn().mockResolvedValue(Buffer.from([1, 2])) };
  const context = { load: async () => "Works at JOCUM." };
  const ended = new Set<string>();
  const linked = new Map<string, string>();
  const sessions = {
    latestForMission: async (missionId: string) => {
      const id = linked.get(missionId);
      return id ? { id, endedAt: ended.has(id) ? clock.at : null } : null;
    },
  } as never;
  const rounds = new Map<string, number>();
  const fasterRounds = { list: async (id: string) => Array.from({ length: rounds.get(id) ?? 0 }) } as never;
  const checkIns: { task?: string; recordedAt: Date }[] = [];
  const checkInRepo = {
    list: async (_language: string, { kind }: { kind?: string } = {}) =>
      checkIns.filter((c) => !kind || (kind === "benchmark") === ((c.task ?? "present_project") === "present_project")).slice(-1),
  } as never;
  const service = new MissionService(missions, coach, levels, context, tts, clock, reviews as unknown as ReviewScheduler, sessions, fasterRounds, checkInRepo);
  return { clock, missions, coach, tts, reviews, service, ended, rounds, checkIns, linked };
}

describe("MissionService", () => {
  it("keeps one mission per local day and moves to the next situation each new day", async () => {
    const { service, clock } = setup();
    const first = await service.today("en", "America/Sao_Paulo");
    expect(first).toMatchObject({ id: "m1", language: "en", day: "2026-11-09", situation: "daily", done: false, sessionId: null });
    expect(await service.today("en", "America/Sao_Paulo")).toEqual(first);

    // 01:00 in São Paulo is a new day: a new mission.
    clock.at = new Date("2026-11-10T04:00:00Z");
    expect(await service.today("en", "America/Sao_Paulo")).toMatchObject({ day: "2026-11-10", situation: "my_day" });
  });

  it("goes on from the last mission after days without one", async () => {
    const { service, clock } = setup();
    await service.today("en", "UTC");
    clock.at = new Date("2026-11-13T12:00:00Z");
    expect(await service.today("en", "UTC")).toMatchObject({ day: "2026-11-13", situation: "my_day" });
  });

  it("keeps nothing when the model can't be written, so the next request tries again", async () => {
    const { service, coach, missions } = setup();
    const { id } = await service.today("en", "UTC");
    coach.model.mockRejectedValueOnce(new TutorUnavailableError("down"));
    await expect(service.model(id)).rejects.toBeInstanceOf(TutorUnavailableError);
    expect((await missions.get(id))?.model).toBeNull();
    expect(await service.model(id)).toEqual(stored(id));
  });

  it("writes the model at the learner's level once, then keeps it", async () => {
    const { service, coach } = setup("A2");
    const { id } = await service.today("en", "UTC");
    expect(await service.model(id)).toEqual(stored(id));
    expect(await service.model(id)).toEqual(stored(id));
    expect(coach.model).toHaveBeenCalledTimes(1);
    expect(coach.model).toHaveBeenCalledWith({ situation: "daily", language: "en", step: "build_light", learnerContext: "Works at JOCUM." });
  });

  it("talks naturally in the model before the learner has a level", async () => {
    const { service, coach } = setup(null);
    await service.model((await service.today("en", "UTC")).id);
    expect(coach.model.mock.calls[0][0].step).toBe("conversation");
  });

  it("says the model in the mission's language", async () => {
    const { service, tts } = setup();
    const { id } = await service.today("en", "UTC");
    expect(await service.modelSpeech(id)).toEqual(Buffer.from([1, 2]));
    expect(tts.synthesize).toHaveBeenCalledWith(model.text, "en");
  });

  it("checks only whether the expression was used, and adds it to the review the first time", async () => {
    const { service, coach, reviews, clock } = setup();
    const { id } = await service.today("en", "UTC");
    const [first] = (await service.model(id)).expressions;

    coach.usedExpression.mockResolvedValueOnce(false);
    expect(await service.say(id, first.id, " Phrase 1 ")).toEqual({ used: false });
    expect(reviews.learned).not.toHaveBeenCalled();

    expect(await service.say(id, first.id, "Phrase 1 my own words")).toEqual({ used: true });
    expect(coach.usedExpression).toHaveBeenLastCalledWith("en", expect.objectContaining({ phrase: "Phrase 1…" }), "Phrase 1 my own words");
    expect(reviews.learned).toHaveBeenCalledWith("en", { kind: "expression", id: first.id }, clock.at);
    expect((await service.model(id)).expressions[0].saidAt).toEqual(clock.at);

    // Using it again is still checked; the review schedules it only once, so asking again is safe.
    expect(await service.say(id, first.id, "Phrase 1 again")).toEqual({ used: true });
    expect(reviews.learned).toHaveBeenCalledTimes(2);
    expect((await service.model(id)).expressions[0].saidAt).toEqual(clock.at);
  });

  it("refuses an expression of another mission or before the model", async () => {
    const { service } = setup();
    const { id } = await service.today("en", "UTC");
    await expect(service.say(id, "m9-e1", "Hi")).rejects.toBeInstanceOf(MissionExpressionNotFoundError);
  });

  it("tracks each step: marked ones, the conversation's end and the 3 rounds", async () => {
    const { service, ended, rounds, checkIns, clock, linked } = setup();
    // A check-in this week: no step 0 today.
    checkIns.push({ recordedAt: new Date("2026-11-05T12:00:00Z") });
    const { id } = await service.today("en", "UTC");
    expect((await service.markStep(id, "listen", "UTC")).steps).toMatchObject({ checkIn: null, listen: true, expressions: false });
    await service.model(id);
    await service.markStep(id, "expressions", "UTC");
    linked.set(id, "s1");
    expect((await service.today("en", "UTC")).steps.task).toBe(false);
    ended.add("s1");
    rounds.set("s1", 3);
    const view = await service.markStep(id, "review", "UTC");
    expect(view).toMatchObject({ sessionId: "s1", done: true });
    expect(view.steps).toEqual({ checkIn: null, listen: true, expressions: true, task: true, faster: true, review: true });

    // The check-in falls due at 12:00 on Nov 19: step 0 of that whole day, from the morning on, done once recorded.
    clock.at = new Date("2026-11-19T08:00:00Z");
    expect((await service.today("en", "UTC")).steps.checkIn).toBe(false);
    checkIns.push({ recordedAt: clock.at });
    expect((await service.today("en", "UTC")).steps.checkIn).toBe(true);
    // The topic task the next morning is not a new check-in: no step 0 that day either.
    // The next day has no step 0.
    clock.at = new Date("2026-11-20T08:00:00Z");
    checkIns.push({ task: "last_weekend", recordedAt: clock.at });
    expect((await service.today("en", "UTC")).steps.checkIn).toBeNull();
  });

  it("judges the check-in's day on the learner's clock", async () => {
    const { service, checkIns, clock } = setup();
    // Recorded at 23:30 on Nov 18 in São Paulo (02:30 UTC on Nov 19).
    checkIns.push({ recordedAt: new Date("2026-11-19T02:30:00Z") });
    clock.at = new Date("2026-11-19T02:45:00Z");
    expect((await service.today("en", "America/Sao_Paulo")).steps.checkIn).toBe(true);
  });

  it("takes step 2 only after the model", async () => {
    const { service } = setup();
    const { id } = await service.today("en", "UTC");
    await expect(service.markStep(id, "expressions", "UTC")).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("fails on an unknown mission", async () => {
    await expect(setup().service.model("nope")).rejects.toBeInstanceOf(MissionNotFoundError);
  });
});

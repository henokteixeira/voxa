import { describe, expect, it, vi } from "vitest";
import type { SpeakingLevel } from "../domain/level/speaking-level.js";
import type { Mission, MissionModel } from "../domain/mission/mission.js";
import type { LevelRepository } from "../domain/ports/level.repository.js";
import type { MissionRepository, NewMission } from "../domain/ports/mission.repository.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";
import { MissionNotFoundError, MissionService } from "./mission.service.js";

class FakeMissions implements MissionRepository {
  rows: Mission[] = [];
  async create(mission: NewMission) {
    const existing = await this.forDay(mission.language, mission.day);
    if (existing) return existing;
    const row = { ...mission, id: `m${this.rows.length + 1}`, model: null };
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
  async saveModel(id: string, model: MissionModel) {
    const row = this.rows.find((m) => m.id === id)!;
    row.model ??= model;
    return row.model;
  }
}

const model: MissionModel = {
  speaker: "Alex",
  text: "Yesterday I fixed the login bug.",
  expressions: [1, 2, 3].map((position) => ({ position, phrase: `Phrase ${position}…`, example: `Example ${position}.` })),
};

function setup(level: SpeakingLevel["level"] | null = "A2") {
  const clock = { at: new Date("2026-11-09T12:00:00Z"), now: () => clock.at };
  const missions = new FakeMissions();
  const coach = { model: vi.fn().mockResolvedValue(model) };
  const levels = {
    current: async () => (level ? { language: "en", level, source: "manual", evidence: [], assessedAt: clock.at } : null),
  } as unknown as LevelRepository;
  const tts = { synthesize: vi.fn().mockResolvedValue(Buffer.from([1, 2])) };
  const context = { load: async () => "Works at JOCUM." };
  return { clock, missions, coach, tts, service: new MissionService(missions, coach, levels, context, tts, clock) };
}

describe("MissionService", () => {
  it("keeps one mission per local day and moves to the next situation each new day", async () => {
    const { service, clock } = setup();
    const first = await service.today("en", "America/Sao_Paulo");
    expect(first).toEqual({ id: "m1", language: "en", day: "2026-11-09", situation: "daily" });
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
    expect(await service.model(id)).toEqual(model);
  });

  it("writes the model at the learner's level once, then keeps it", async () => {
    const { service, coach } = setup("A2");
    const { id } = await service.today("en", "UTC");
    expect(await service.model(id)).toEqual(model);
    expect(await service.model(id)).toEqual(model);
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

  it("fails on an unknown mission", async () => {
    await expect(setup().service.model("nope")).rejects.toBeInstanceOf(MissionNotFoundError);
  });
});

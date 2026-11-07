import { beforeEach, describe, expect, it } from "vitest";
import type { SpeakingLevel } from "../domain/level/speaking-level.js";
import type { LevelRepository } from "../domain/ports/level.repository.js";
import { LevelService } from "./level.service.js";

class InMemoryLevels implements LevelRepository {
  readonly rows: SpeakingLevel[] = [];
  readonly bySession = new Map<string, SpeakingLevel>();
  async addForSession(sessionId: string, level: SpeakingLevel) {
    const existing = this.bySession.get(sessionId);
    if (existing) return existing;
    this.bySession.set(sessionId, level);
    this.rows.push(level);
    return level;
  }
  async forSession(sessionId: string) {
    return this.bySession.get(sessionId) ?? null;
  }
  async add(level: SpeakingLevel) {
    this.rows.push(level);
  }
  async current(language: string) {
    return this.rows.filter((r) => r.language === language).at(-1) ?? null;
  }
  async lastPlacementAt(language: string) {
    return this.rows.filter((r) => r.language === language && r.source === "placement").at(-1)?.assessedAt ?? null;
  }
}

const now = new Date("2026-11-07T12:00:00Z");
let levels: InMemoryLevels;
let service: LevelService;

beforeEach(() => {
  levels = new InMemoryLevels();
  service = new LevelService(levels, { now: () => now });
});

describe("LevelService", () => {
  it("has no level and suggests a placement at first", async () => {
    expect(await service.view("en")).toEqual({ current: null, placementDue: true });
  });

  it("shows the current level with the support step it starts sessions at", async () => {
    await levels.add({ language: "en", level: "A2", source: "placement", evidence: ["I work in app"], assessedAt: now });
    expect(await service.view("en")).toEqual({
      current: { language: "en", level: "A2", source: "placement", evidence: ["I work in app"], assessedAt: now, step: "build_light" },
      placementDue: false,
    });
  });

  it("keeps the last placement's date when the level is then set by hand", async () => {
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    await levels.add({ language: "en", level: "A2", source: "placement", evidence: [], assessedAt: tenDaysAgo });
    const view = await service.setByHand("en", "B1");
    expect(view).toMatchObject({ current: { level: "B1", source: "manual" }, placementDue: false });
  });

  it("suggests a new placement 4 weeks after the last one", async () => {
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    await levels.add({ language: "en", level: "A2", source: "placement", evidence: [], assessedAt: fourWeeksAgo });
    expect((await service.view("en")).placementDue).toBe(true);
  });

  it("lets the learner set the level by hand, without counting it as a placement", async () => {
    const view = await service.setByHand("en", "B1");
    expect(view.current).toMatchObject({ level: "B1", source: "manual", evidence: [], assessedAt: now, step: "supported" });
    expect(view.placementDue).toBe(true);
  });
});

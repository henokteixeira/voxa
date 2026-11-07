import { beforeEach, describe, expect, it } from "vitest";
import type { SpeakingLevel } from "../domain/level/speaking-level.js";
import { InvalidInputError } from "../domain/errors.js";
import type { SessionSignals } from "../domain/progress/signal-trend.js";
import type { LevelRepository } from "../domain/ports/level.repository.js";
import type { SessionSignalsRecord, SignalsRepository } from "../domain/ports/signals.repository.js";
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

/** Only what the level reads: the newest records. */
class InMemorySignals implements Pick<SignalsRepository, "recent"> {
  readonly rows: SessionSignalsRecord[] = [];
  async recent(language: string, limit: number) {
    return this.rows.filter((r) => r.language === language).reverse().slice(0, limit);
  }
}

const now = new Date("2026-11-07T12:00:00Z");
let levels: InMemoryLevels;
let signals: InMemorySignals;
let time: Date;
let service: LevelService;

beforeEach(() => {
  levels = new InMemoryLevels();
  signals = new InMemorySignals();
  time = now;
  service = new LevelService(levels, signals as unknown as SignalsRepository, { now: () => time });
});

describe("LevelService", () => {
  it("has no level and suggests a placement at first", async () => {
    expect(await service.view("en")).toEqual({ current: null, placementDue: true, proposal: null });
  });

  it("shows the current level with the support step it starts sessions at", async () => {
    await levels.add({ language: "en", level: "A2", source: "placement", evidence: ["I work in app"], assessedAt: now });
    expect(await service.view("en")).toEqual({
      current: { language: "en", level: "A2", source: "placement", evidence: ["I work in app"], assessedAt: now, step: "build_light" },
      placementDue: false,
      proposal: null,
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

  const practiced = (unaidedShare: number, minutesAfter: number) => {
    const signal: SessionSignals = {
      unaidedShare,
      wordsPerMinute: null,
      longPausesPerMinute: null,
      averagePauseMs: null,
      mistakesPer100Words: null,
      selfCorrectionRate: null,
    };
    signals.rows.push({
      sessionId: `s${signals.rows.length + 1}`,
      language: "en",
      mode: "daily",
      signals: signal,
      recordedAt: new Date(now.getTime() + minutesAfter * 60_000),
    });
  };

  it("proposes a step up from the sessions since the current level, and the learner confirms it", async () => {
    await levels.add({ language: "en", level: "A2", source: "placement", evidence: [], assessedAt: now });
    practiced(0.9, 10);
    practiced(0.85, 20);
    expect((await service.view("en")).proposal).toBeNull();
    practiced(1, 30);
    expect((await service.view("en")).proposal).toEqual({ direction: "up", to: "B1", basedOn: "s3" });

    time = new Date(now.getTime() + 40 * 60_000);
    const view = await service.confirmStepChange("en", "B1");
    expect(view.current).toMatchObject({ level: "B1", source: "step_change", step: "supported" });
    // The sessions before the new level no longer count.
    expect(view.proposal).toBeNull();
  });

  it("ignores sessions from before the current level", async () => {
    practiced(0.1, -30);
    practiced(0.1, -20);
    await levels.add({ language: "en", level: "B1", source: "manual", evidence: [], assessedAt: now });
    practiced(0.1, 10);
    expect((await service.view("en")).proposal).toBeNull();
  });

  it("refuses to confirm a step change that is not proposed", async () => {
    await levels.add({ language: "en", level: "A2", source: "placement", evidence: [], assessedAt: now });
    await expect(service.confirmStepChange("en", "B1")).rejects.toBeInstanceOf(InvalidInputError);
    expect(levels.rows).toHaveLength(1);
  });
});

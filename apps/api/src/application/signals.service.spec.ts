import { describe, expect, it } from "vitest";
import type { SessionSignals } from "../domain/progress/signal-trend.js";
import type { SessionSignalsRecord, SignalsRepository } from "../domain/ports/signals.repository.js";
import { SignalsService } from "./signals.service.js";

class FakeSignals implements SignalsRepository {
  rows: SessionSignalsRecord[] = [];
  async recordOnce(record: SessionSignalsRecord) {
    const existing = this.rows.find((r) => r.sessionId === record.sessionId);
    if (existing) return existing;
    this.rows.push(record);
    return record;
  }
  async earlierThan(sessionId: string, limit: number) {
    const index = this.rows.findIndex((r) => r.sessionId === sessionId);
    const language = this.rows[index]?.language;
    return this.rows.slice(0, Math.max(index, 0)).filter((r) => r.language === language).reverse().slice(0, limit);
  }
}

const clock = { now: () => new Date("2026-11-07T10:00:00Z") };
const signals = (wordsPerMinute: number): SessionSignals => ({
  unaidedShare: null,
  wordsPerMinute,
  longPausesPerMinute: null,
  averagePauseMs: null,
  mistakesPer100Words: null,
  selfCorrectionRate: null,
});

describe("SignalsService", () => {
  it("compares a session with the ones before and keeps that comparison when the session ends again", async () => {
    const repository = new FakeSignals();
    const service = new SignalsService(repository, clock);
    expect(await service.recordSession({ sessionId: "s1", language: "en", mode: "daily", signals: signals(60) })).toBeNull();

    const ended = { sessionId: "s2", language: "en", mode: "daily" as const, signals: signals(80) };
    const comparison = await service.recordSession(ended);
    expect(comparison).toEqual({
      sessions: 1,
      signals: [{ name: "wordsPerMinute", current: 80, baseline: 60, trend: "better" }],
    });
    // Ending again (e.g. a retry) changes nothing, even if a later session was stored meanwhile.
    await service.recordSession({ sessionId: "s3", language: "en", mode: "daily", signals: signals(90) });
    expect(await service.recordSession({ ...ended, signals: signals(10) })).toEqual(comparison);
  });

  it("does not store a session that measured nothing, so it never pushes real sessions out", async () => {
    const repository = new FakeSignals();
    const service = new SignalsService(repository, clock);
    await service.recordSession({ sessionId: "s1", language: "en", mode: "daily", signals: signals(60) });
    const empty = { ...signals(0), wordsPerMinute: null };
    expect(await service.recordSession({ sessionId: "s2", language: "en", mode: "daily", signals: empty })).toBeNull();
    expect(repository.rows.map((r) => r.sessionId)).toEqual(["s1"]);
  });

  it("does not store the placement interview", async () => {
    const repository = new FakeSignals();
    const service = new SignalsService(repository, clock);
    expect(await service.recordSession({ sessionId: "p1", language: "en", mode: "placement", signals: signals(60) })).toBeNull();
    expect(repository.rows).toEqual([]);
  });
});

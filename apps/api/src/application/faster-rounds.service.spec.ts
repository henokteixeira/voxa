import { describe, expect, it } from "vitest";
import type { Session } from "../domain/conversation/types.js";
import type { FasterRoundRecord, FasterRoundRepository } from "../domain/ports/faster-round.repository.js";
import { SessionNotFoundError } from "./conversation.service.js";
import { FasterRoundsService } from "./faster-rounds.service.js";

class FakeRounds implements FasterRoundRepository {
  rows: FasterRoundRecord[] = [];
  async saveOnce(record: FasterRoundRecord) {
    if (!this.rows.some((r) => r.sessionId === record.sessionId && r.round === record.round)) this.rows.push(record);
  }
  async list(sessionId: string) {
    return this.rows.filter((r) => r.sessionId === sessionId).sort((a, b) => a.round - b.round);
  }
  async toldSince(language: string, since: Date) {
    return this.rows.filter((r) => r.language === language && r.recordedAt >= since);
  }
}

const now = new Date("2026-11-09T10:00:00Z");
function setup(session: Partial<Session> | null = {}) {
  const rounds = new FakeRounds();
  const found = session && ({ id: "s1", language: "en", mode: "daily", endedAt: now, ...session } as Session);
  const service = new FasterRoundsService(rounds, { get: async () => found }, { now: () => now });
  return { rounds, service };
}
const told = (round: number, transcript = "I finished the login screen", speechMs = 5_000) => ({
  round,
  transcript,
  speechMs,
  longPausesMs: [400, 1_200],
});

describe("FasterRoundsService", () => {
  it("stores each round in order and gives the result after the third", async () => {
    const { service, rounds } = setup();
    expect(await service.view("s1")).toMatchObject({ language: "en", rounds: [], nextRound: 1, nextLimitMs: 120_000, result: null });

    const afterOne = await service.record("s1", told(1));
    expect(afterOne).toMatchObject({ nextRound: 2, nextLimitMs: 90_000, result: null });
    // Words are counted here and only the long pauses count.
    expect(rounds.rows[0]).toMatchObject({ language: "en", timeLimitMs: 120_000, spokenWords: 5, longPauses: 1, recordedAt: now });

    await service.record("s1", told(2));
    const done = await service.record("s1", told(3, "I finished the login screen", 4_000));
    expect(done).toMatchObject({ nextRound: null, nextLimitMs: null, result: { paceChangePercent: 25 } });
    // A retry of the last round, even with other numbers, gives the same result.
    expect(await service.record("s1", told(3, "x", 200_000))).toEqual(done);
  });

  it("ignores a round sent again and refuses one out of order", async () => {
    const { service, rounds } = setup();
    await service.record("s1", told(1, "first try"));
    await service.record("s1", told(1, "sent again"));
    expect(rounds.rows.map((r) => r.transcript)).toEqual(["first try"]);
    await expect(service.record("s1", told(3))).rejects.toMatchObject({ code: "invalid" });
    await expect(service.record("s1", told(4))).rejects.toMatchObject({ code: "invalid" });
  });

  it("shows the XP the rounds earned: 1 a minute of speech, like the conversation", async () => {
    const { service } = setup();
    expect((await service.view("s1")).xp).toBe(0);
    await service.record("s1", told(1, "words", 100_000));
    const view = await service.record("s1", told(2, "words", 80_000));
    expect(view.xp).toBe(3);
  });

  it("refuses speech longer than the round allows", async () => {
    const { service } = setup();
    await expect(service.record("s1", told(1, "words", 126_000))).rejects.toMatchObject({ code: "invalid" });
  });

  it("only follows an ended practice session", async () => {
    await expect(setup(null).service.view("s1")).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(setup({ endedAt: null }).service.record("s1", told(1))).rejects.toMatchObject({ code: "invalid" });
    await expect(setup({ mode: "placement" }).service.view("s1")).rejects.toMatchObject({ code: "invalid" });
    await expect(setup({ mode: "placement" }).service.record("s1", told(1))).rejects.toMatchObject({ code: "invalid" });
  });
});

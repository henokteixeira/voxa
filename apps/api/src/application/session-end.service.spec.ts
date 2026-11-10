import { describe, expect, it, vi } from "vitest";
import type { SessionSummaryService } from "./session-summary.service.js";
import type { ProgressService } from "./progress.service.js";
import { SessionEndService } from "./session-end.service.js";
import type { SignalsService } from "./signals.service.js";

const summary = {
  sessionId: "s1",
  selfCorrections: 2,
  signals: { wordsPerMinute: 80 },
  goals: [
    { id: "yesterday", covered: true },
    { id: "today", covered: false },
  ],
};

function setup() {
  const summaries = { end: vi.fn().mockResolvedValue(summary) };
  const progress = { awardSession: vi.fn().mockResolvedValue({ awards: [], total: 10 }) };
  const signals = { recordSession: vi.fn().mockResolvedValue(null) };
  const service = new SessionEndService(
    summaries as unknown as SessionSummaryService,
    progress as unknown as ProgressService,
    signals as unknown as SignalsService,
  );
  return { service, summaries, progress, signals };
}

describe("SessionEndService.close", () => {
  it("ends the session at the time given, and counts its XP and signals at that time", async () => {
    const { service, summaries, progress, signals } = setup();
    const endsAt = new Date("2026-11-09T22:30:00Z");

    await service.close("s1", endsAt);

    expect(summaries.end).toHaveBeenCalledWith("s1", null, endsAt);
    expect(progress.awardSession).toHaveBeenCalledWith({
      sessionId: "s1",
      goalsCovered: 1,
      selfCorrections: 2,
      wordsPerMinute: 80,
      awardedAt: endsAt,
    });
    expect(signals.recordSession).toHaveBeenCalledWith(summary, endsAt);
  });
});

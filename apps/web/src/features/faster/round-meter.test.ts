import { describe, expect, it } from "vitest";
import { RoundMeter } from "./round-meter";

describe("RoundMeter", () => {
  it("measures a round told in two turns, in the order they were said", () => {
    const meter = new RoundMeter();
    meter.speechStarted(1_000);
    const first = meter.turnEnded(13_500, { trailingSilenceMs: 2_500, pausesMs: [400, 1_300] });
    meter.speechStarted(14_000);
    const second = meter.turnEnded(20_000, { trailingSilenceMs: 0 });
    meter.heard(second, " and then I tested it ");
    meter.heard(first, "I finished the login");

    expect(meter.measure()).toEqual({
      transcript: "I finished the login and then I tested it",
      // From the first word to the end of the last one.
      speechMs: 19_000,
      // 1.3 s inside the first turn, 3 s between the turns (11 s → 14 s).
      longPausesMs: [1_300, 3_000],
    });
  });

  it("measures nothing when nobody spoke", () => {
    expect(new RoundMeter().measure()).toEqual({ transcript: "", speechMs: 0, longPausesMs: [] });
  });
});

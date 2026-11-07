import { describe, expect, it } from "vitest";
import { initialSessionState, type SessionState } from "./session-state";
import { cuesFor } from "./use-session-cues";

const live = (patch: Partial<SessionState> = {}): SessionState => ({
  ...initialSessionState,
  phase: "thinking",
  sessionId: "s1",
  ...patch,
});

describe("cuesFor", () => {
  it("opens the learner's turn and closes it", () => {
    expect(cuesFor(live({ phase: "speaking" }), live({ phase: "listening" }))).toEqual(["yourTurn"]);
    expect(cuesFor(live({ phase: "hearing" }), live({ phase: "thinking" }))).toEqual(["turnSent"]);
  });

  it("marks a hint, the correct form and a self-correction", () => {
    expect(cuesFor(live(), live({ hintStep: 1 }))).toEqual(["hint"]);
    expect(cuesFor(live({ hintStep: 2 }), live({ hintStep: 2, revealed: true }))).toEqual(["revealed"]);
    expect(cuesFor(live({ hintStep: 1 }), live({ hintStep: 0, fixed: true }))).toEqual(["selfCorrected"]);
  });

  it("marks a newly covered goal", () => {
    expect(cuesFor(live({ coveredGoals: ["a"] }), live({ coveredGoals: ["a", "b"] }))).toEqual(["goalCovered"]);
  });

  it("stays quiet when a session is picked up again", () => {
    const resumed = live({ phase: "paused", hintStep: 1, coveredGoals: ["a"] });
    expect(cuesFor({ ...initialSessionState }, resumed)).toEqual([]);
  });
});

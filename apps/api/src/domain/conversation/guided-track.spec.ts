import { describe, expect, it } from "vitest";
import { advance, repeatedModel, startTrack, type TrackState, type TrackTurn, trackView } from "./guided-track.js";

const ok: TrackTurn = { stuck: false, repeated: true, nextGoal: "today" };
const stuck: TrackTurn = { stuck: true, repeated: false, nextGoal: "today" };
const at = (stage: TrackState["stage"], over: Partial<TrackState> = {}): TrackState => ({
  stage,
  goal: "yesterday",
  tries: 0,
  helped: false,
  unaidedStreak: 0,
  stuckStreak: 0,
  ...over,
});

describe("trackView", () => {
  it("numbers the stage in the track, and is null without a track", () => {
    const track = startTrack("build_light", "yesterday");
    expect(trackView(track)).toEqual({ stage: "answer", number: 4, total: 5 });
    expect(trackView(null)).toBeNull();
  });
});

describe("startTrack", () => {
  it("starts a goal at the model at A1, at the answer at A2, and not at all from B1 up", () => {
    expect(startTrack("build_full", "yesterday")?.stage).toBe("model");
    expect(startTrack("build_light", "yesterday")?.stage).toBe("answer");
    expect(startTrack("supported", "yesterday")).toBeNull();
  });
});

describe("advance", () => {
  it("goes model, swap, extend, answer, again, then the next goal, covering the goal with the learner's answer", () => {
    let state = at("model");
    const stages: string[] = [];
    const covered: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      const move = advance(state, "build_full", ok);
      state = move.track;
      stages.push(state.stage);
      covered.push(move.covered);
    }
    expect(stages).toEqual(["swap", "extend", "answer", "again", "model"]);
    expect(covered).toEqual([null, null, null, "yesterday", null]);
    expect(state.goal).toBe("today");
  });

  it("says the model again, slower, once when the repetition does not match, then moves on", () => {
    const once = advance(at("model"), "build_full", { ...ok, repeated: false });
    expect(once.track).toMatchObject({ stage: "model", tries: 1 });
    expect(advance(once.track, "build_full", { ...ok, repeated: false }).track).toMatchObject({ stage: "swap", tries: 0 });
  });

  it("builds the answer from the model once when the learner is stuck at it, then moves to the next goal", () => {
    const first = advance(at("answer"), "build_light", stuck);
    expect(first.track).toMatchObject({ stage: "model", helped: true });
    expect(first.covered).toBeNull();
    const again = advance(at("answer", { helped: true }), "build_light", stuck);
    expect(again.track).toMatchObject({ stage: "answer", goal: "today", helped: false, stuckStreak: 1 });
  });

  /** Plays one whole goal from its first stage, the learner stuck at the answer or not. */
  const playGoal = (state: TrackState, step: "build_full" | "build_light", stuckAtAnswer: boolean, nextGoal: string) => {
    let move = { track: state, step, covered: null as string | null };
    for (let i = 0; i < 12 && move.track.goal === state.goal; i++) {
      const atAnswer = move.track.stage === "answer" && !move.track.helped;
      move = advance(move.track, move.step, { stuck: atAnswer && stuckAtAnswer, repeated: true, nextGoal });
    }
    return move;
  };

  it("skips the model after two goals answered alone at A1, but not when one needed the model", () => {
    const one = playGoal(at("model"), "build_full", false, "today");
    expect(one).toMatchObject({ step: "build_full", track: { stage: "model", unaidedStreak: 1 } });
    const two = playGoal({ ...one.track }, "build_full", false, "blockers");
    expect(two).toMatchObject({ step: "build_light", track: { stage: "answer", goal: "blockers", unaidedStreak: 0 } });

    const helped = playGoal(at("model"), "build_full", true, "today");
    expect(helped.track).toMatchObject({ unaidedStreak: 0, stuckStreak: 1 });
    expect(playGoal(helped.track, "build_full", false, "blockers").step).toBe("build_full");
  });

  it("brings the model back at A2 after two goals in a row stuck at the answer", () => {
    const one = playGoal(at("answer"), "build_light", true, "today");
    expect(one).toMatchObject({ step: "build_light", track: { stage: "answer", stuckStreak: 1 } });
    const two = playGoal(one.track, "build_light", true, "blockers");
    expect(two).toMatchObject({ step: "build_full", track: { stage: "model", goal: "blockers", stuckStreak: 0 } });
  });
});

describe("repeatedModel", () => {
  it("accepts a repetition with most of the model's words, ignoring case and punctuation", () => {
    expect(repeatedModel("Yesterday I worked on the login screen.", "yesterday I work on the login screen")).toBe(true);
    expect(repeatedModel("Yesterday I worked on the login screen.", "I don't know")).toBe(false);
  });
});

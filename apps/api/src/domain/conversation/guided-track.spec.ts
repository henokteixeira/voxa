import { describe, expect, it } from "vitest";
import { advance, givesWords, nextGoalAfter, resolveTrackTurn, startTrack, type TrackState, trackOutcomes, trackView } from "./guided-track.js";

const GOALS = ["yesterday", "today", "blockers"];
const at = (over: Partial<TrackState> = {}): TrackState => ({
  stage: "answer",
  goal: "yesterday",
  support: "frame",
  tries: 0,
  unaidedStreak: 0,
  ...over,
});
const ok = (nextGoal: string | null = "today") => ({ stuck: false, nextGoal });
const stuck = (nextGoal: string | null = "today") => ({ stuck: true, nextGoal });

describe("startTrack", () => {
  it("runs from A1 to B1 in a conversation with goals: the example at A1, the sentence to complete at A2 and B1", () => {
    expect(startTrack("build_full", GOALS)).toMatchObject({ stage: "answer", goal: "yesterday", support: "example" });
    expect(startTrack("build_light", GOALS)?.support).toBe("frame");
    expect(startTrack("supported", GOALS)?.support).toBe("frame");
  });

  it("does not run from B2 up, in free talk or in the placement interview", () => {
    expect(startTrack("conversation", GOALS)).toBeNull();
    expect(startTrack("demanding", GOALS)).toBeNull();
    expect(startTrack("supported", [])).toBeNull();
    expect(startTrack(null, GOALS)).toBeNull();
  });
});

describe("trackView", () => {
  it("numbers one step per goal and the last step after them, which has no goal", () => {
    expect(trackView(at({ goal: "today" }), GOALS)).toEqual({ stage: "answer", support: "frame", goal: "today", number: 2, total: 4 });
    expect(trackView(at({ stage: "retell", goal: null }), GOALS)).toMatchObject({ goal: null, number: 4, total: 4 });
    expect(trackView(null, GOALS)).toBeNull();
  });
});

describe("advance", () => {
  it("covers the goal answered without being stuck and goes to the next one", () => {
    const move = advance(at(), ok());
    expect(move.covered).toBe("yesterday");
    expect(move.track).toMatchObject({ stage: "answer", goal: "today", support: "frame", unaidedStreak: 1 });
  });

  it("gives fewer words after two goals in a row answered without being stuck, down to none", () => {
    expect(advance(at({ unaidedStreak: 1 }), ok()).track).toMatchObject({ support: "start", unaidedStreak: 0 });
    expect(advance(at({ support: "start", unaidedStreak: 1 }), ok()).track?.support).toBe("alone");
    expect(advance(at({ support: "alone", unaidedStreak: 1 }), ok()).track?.support).toBe("alone");
  });

  it("asks the same goal once more with more words when stuck, then moves on without covering it", () => {
    const again = advance(at({ unaidedStreak: 1 }), stuck());
    expect(again.track).toMatchObject({ goal: "yesterday", support: "example", tries: 1, unaidedStreak: 0 });
    expect(again.covered).toBeNull();
    const on = advance(again.track!, stuck());
    expect(on.track).toMatchObject({ goal: "today", support: "example", tries: 0 });
    expect(on.covered).toBeNull();
  });

  it("asks to put it all together after the last goal, then ends the script", () => {
    const last = advance(at({ goal: "blockers" }), ok(null));
    expect(last.track).toMatchObject({ stage: "retell", goal: null });
    expect(last.covered).toBe("blockers");
    expect(advance(last.track!, ok(null)).track).toBeNull();
  });

  it("asks once more to put it together when stuck, then ends anyway", () => {
    const retell = at({ stage: "retell", goal: null });
    const again = advance(retell, stuck(null));
    expect(again.track).toMatchObject({ stage: "retell", tries: 1 });
    expect(advance(again.track!, stuck(null)).track).toBeNull();
  });
});

describe("advance after a retry", () => {
  it("covers a goal answered at its retry without fading the help, and keeps the extra help for the next goal", () => {
    const move = advance(at({ support: "example", tries: 1, unaidedStreak: 0 }), ok());
    expect(move.covered).toBe("yesterday");
    expect(move.track).toMatchObject({ goal: "today", support: "example", unaidedStreak: 0 });
  });
});

describe("nextGoalAfter", () => {
  it("goes on in order and never back to a goal the script moved past", () => {
    expect(nextGoalAfter(GOALS, "today", [])).toBe("blockers");
    expect(nextGoalAfter(GOALS, "yesterday", ["today"])).toBe("blockers");
    expect(nextGoalAfter(GOALS, "blockers", [])).toBeNull();
  });
});

describe("givesWords", () => {
  it("gives words at every step but a goal answered alone", () => {
    expect(givesWords(at({ support: "start" }))).toBe(true);
    expect(givesWords(at({ support: "alone" }))).toBe(false);
    expect(givesWords(at({ stage: "retell", goal: null, support: "alone" }))).toBe(true);
  });
});

describe("resolveTrackTurn", () => {
  const outcomes = trackOutcomes(at(), "today");
  const verdict = { stuck: false, scaffold: " I worked on ___. ", keyWords: ["fixed", "the login", "bug", "extra"] };

  it("moves on a plain reply, with the words given and at most 3 key words for a sentence to complete", () => {
    const turn = resolveTrackTurn({ outcomes, replied: true, verdict });
    expect(turn.move?.track?.goal).toBe("today");
    expect(turn.scaffold).toBe("I worked on ___.");
    expect(turn.keyWords).toEqual(["fixed", "the login", "bug"]);
  });

  it("does not move while a hint is pending, and gives no words then", () => {
    expect(resolveTrackTurn({ outcomes, replied: false, verdict })).toEqual({ move: null, scaffold: null, keyWords: [] });
  });

  it("gives no words for a goal answered alone, and no key words outside a sentence to complete", () => {
    const alone = trackOutcomes(at({ support: "start", unaidedStreak: 1 }), "today");
    expect(resolveTrackTurn({ outcomes: alone, replied: true, verdict })).toMatchObject({ scaffold: null, keyWords: [] });
    const start = trackOutcomes(at({ support: "start" }), "today");
    expect(resolveTrackTurn({ outcomes: start, replied: true, verdict })).toMatchObject({ scaffold: "I worked on ___.", keyWords: [] });
  });
});

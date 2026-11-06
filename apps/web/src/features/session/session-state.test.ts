import { describe, expect, it } from "vitest";
import { initialSessionState, type SessionAction, type SessionState, sessionReducer } from "./session-state";

function run(...actions: SessionAction[]): SessionState {
  return actions.reduce(sessionReducer, initialSessionState);
}

const started: SessionAction = { type: "started", sessionId: "s1", message: "Morning! What did you do yesterday?" };
const hint = (message = "When did it happen?"): SessionAction => ({
  type: "tutor",
  result: { kind: "hint", message, selfCorrected: false },
});

describe("sessionReducer", () => {
  it("opens with the tutor's first line, speaks it, then hands over", () => {
    let state = run(started, { type: "sent", request: "speak" });
    expect(state.phase).toBe("thinking");
    expect(state.captions).toEqual([{ who: "tutor", text: "Morning! What did you do yesterday?" }]);
    state = sessionReducer(state, { type: "speech" });
    expect(state.phase).toBe("speaking");
    state = sessionReducer(sessionReducer(state, { type: "done" }), { type: "playback_end" });
    expect(state.phase).toBe("listening");
  });

  it("goes listening → hearing → thinking, and shows both sides as captions", () => {
    const state = run(
      started,
      { type: "done" },
      { type: "speech_start" },
      { type: "sent", request: "audio" },
      { type: "transcript", text: "I fixed the bug." },
      { type: "tutor", result: { kind: "reply", message: "Nice. What's next?", selfCorrected: false } },
    );
    expect(state.phase).toBe("thinking");
    expect(state.captions.map((c) => c.who)).toEqual(["tutor", "you", "tutor"]);
    expect(state.hintStep).toBe(0);
  });

  it("climbs the hint ladder and keeps the sentence the hint is about", () => {
    let state = run(started, { type: "sent", request: "audio" }, { type: "transcript", text: "Yesterday I finish it" }, hint());
    expect(state).toMatchObject({ hintStep: 1, hintFor: "Yesterday I finish it", revealed: false });

    state = run(
      started,
      { type: "sent", request: "audio" },
      { type: "transcript", text: "Yesterday I finish it" },
      hint(),
      { type: "sent", request: "audio" },
      { type: "transcript", text: "Yesterday I finishing it" },
      hint("Past form of finish."),
    );
    expect(state).toMatchObject({ hintStep: 2, hintFor: "Yesterday I finish it" });

    state = sessionReducer(state, { type: "tutor", result: { kind: "reveal", message: "Say: I finished it.", selfCorrected: false } });
    expect(state.revealed).toBe(true);
  });

  it("celebrates a fix after a hint and closes the ladder", () => {
    const state = run(
      started,
      { type: "sent", request: "audio" },
      hint(),
      { type: "sent", request: "audio" },
      { type: "tutor", result: { kind: "reply", message: "Right!", selfCorrected: true } },
    );
    expect(state).toMatchObject({ fixed: true, hintStep: 0, hintFor: null });
    expect(sessionReducer(state, { type: "sent", request: "audio" }).fixed).toBe(false);
  });

  it("says it didn't catch a turn without speech and listens again", () => {
    const state = run(started, { type: "sent", request: "audio" }, { type: "done" });
    expect(state).toMatchObject({ phase: "listening", missed: true });
    expect(sessionReducer(state, { type: "speech_start" }).missed).toBe(false);
  });

  it("treats a bad recording as 'didn't catch that', not as a failure", () => {
    const state = run(started, { type: "sent", request: "audio" }, { type: "failed", code: "bad_audio" });
    expect(state).toMatchObject({ phase: "listening", missed: true, failure: null });
  });

  it.each([
    ["before the transcript", [] as SessionAction[], { kind: "listen" }],
    ["after the transcript", [{ type: "transcript", text: "I fixed it" }] as SessionAction[], { kind: "text", text: "I fixed it" }],
    [
      "after the tutor answered",
      [{ type: "transcript", text: "I fixed it" }, hint()] as SessionAction[],
      { kind: "speak" },
    ],
  ])("remembers how to retry a failure %s", (_when, steps, retry) => {
    const state = run(started, { type: "sent", request: "audio" }, ...steps, { type: "failed", code: "voice_unavailable" });
    expect(state).toMatchObject({ phase: "failed", failure: "voice_unavailable", retry });
    // The trailing "done" does not hide the failure.
    expect(sessionReducer(state, { type: "done" }).phase).toBe("failed");
  });

  it("retries the opening line when speaking it failed", () => {
    const state = run(started, { type: "sent", request: "speak" }, { type: "failed", code: "voice_unavailable" });
    expect(state.retry).toEqual({ kind: "speak" });
  });

  it("pauses and resumes into listening", () => {
    const paused = run(started, { type: "done" }, { type: "pause" });
    expect(paused.phase).toBe("paused");
    expect(sessionReducer(paused, { type: "speech_start" }).phase).toBe("paused");
    expect(sessionReducer(paused, { type: "resume" }).phase).toBe("listening");
  });

  it("ends with the number of saved mistakes", () => {
    expect(run(started, { type: "ending" }, { type: "ended", mistakes: 3 })).toMatchObject({ phase: "ended", mistakesSaved: 3 });
  });
});

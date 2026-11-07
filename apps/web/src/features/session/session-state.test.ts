import type { SessionSummary } from "@/lib/api";
import { describe, expect, it } from "vitest";
import { initialSessionState, type SessionAction, type SessionState, sessionReducer } from "./session-state";

function run(...actions: SessionAction[]): SessionState {
  return actions.reduce(sessionReducer, initialSessionState);
}

const WAV = new ArrayBuffer(64);
const started: SessionAction = { type: "started", sessionId: "s1", message: "Morning! What did you do yesterday?" };
const hint = (message = "When did it happen?"): SessionAction => ({
  type: "tutor",
  result: { kind: "hint", message, selfCorrected: false, mistake: "I finish it" },
});

describe("sessionReducer", () => {
  it("adds a follow-up line after the reply: a hint about what the learner just said", () => {
    const state = run(
      started,
      { type: "sent", request: "audio", audio: WAV },
      { type: "transcript", text: "Yesterday I finish it" },
      { type: "tutor", result: { kind: "reply", message: "Nice. What's next?", selfCorrected: false } },
      {
        type: "followup",
        result: { kind: "hint", message: "When did it happen?", selfCorrected: false, support: "Pense no passado.", mistake: "I finish it" },
      },
    );
    expect(state.captions.map((c) => c.text)).toEqual([
      "Morning! What did you do yesterday?",
      "Yesterday I finish it",
      "Nice. What's next?",
      "When did it happen?",
    ]);
    expect(state).toMatchObject({ hintStep: 1, hintFor: "I finish it", support: "Pense no passado." });
  });

  it("takes help and goals from a follow-up without a spoken line", () => {
    const state = run(
      started,
      { type: "sent", request: "audio", audio: WAV },
      { type: "transcript", text: "Ontem eu fixed it" },
      { type: "tutor", result: { kind: "reply", message: "Ontem is yesterday. Nice!", selfCorrected: false } },
      { type: "followup", result: { kind: "reply", message: null, selfCorrected: false, support: "Ontem = yesterday.", coveredGoals: ["yesterday"] } },
    );
    expect(state.captions.at(-1)?.text).toBe("Ontem is yesterday. Nice!");
    expect(state).toMatchObject({ support: "Ontem = yesterday.", coveredGoals: ["yesterday"], hintStep: 0 });
  });

  it("follows the guided track and the words to say, which leave once the learner answers", () => {
    const model = "Yesterday I worked on the login screen.";
    let state = run({ ...started, track: { stage: "model", number: 1, total: 5 }, scaffold: model });
    expect(state).toMatchObject({ track: { stage: "model" }, scaffold: model });
    state = run(
      { ...started, track: { stage: "model", number: 1, total: 5 }, scaffold: model },
      { type: "sent", request: "audio", audio: WAV },
      { type: "transcript", text: model },
    );
    expect(state).toMatchObject({ track: { stage: "model" }, scaffold: null });
    state = sessionReducer(state, {
      type: "tutor",
      result: { kind: "reply", message: "Great. Now with your own work.", selfCorrected: false },
    });
    // An older server sends no track: the step stays.
    expect(state).toMatchObject({ track: { stage: "model" }, scaffold: null });
    state = sessionReducer(state, {
      type: "followup",
      result: { kind: "reply", message: null, selfCorrected: false, track: { stage: "swap", number: 2, total: 5 }, scaffold: null },
    });
    expect(state).toMatchObject({ track: { stage: "swap", number: 2 }, scaffold: null });
  });

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
      { type: "sent", request: "audio", audio: WAV },
      { type: "transcript", text: "I fixed the bug." },
      { type: "tutor", result: { kind: "reply", message: "Nice. What's next?", selfCorrected: false } },
    );
    expect(state.phase).toBe("thinking");
    expect(state.captions.map((c) => c.who)).toEqual(["tutor", "you", "tutor"]);
    expect(state.hintStep).toBe(0);
  });

  it("shows no excerpt when the hint does not say which words it is about", () => {
    const state = run(started, { type: "sent", request: "audio", audio: WAV }, { type: "transcript", text: "Yesterday I finish it" }, {
      type: "tutor",
      result: { kind: "hint", message: "When did it happen?", selfCorrected: false },
    });
    expect(state).toMatchObject({ hintStep: 1, hintFor: null });
  });

  it("climbs the hint ladder and keeps the words the hint is about", () => {
    let state = run(started, { type: "sent", request: "audio", audio: WAV }, { type: "transcript", text: "Yesterday I finish it" }, hint());
    expect(state).toMatchObject({ hintStep: 1, hintFor: "I finish it", revealed: false });

    state = run(
      started,
      { type: "sent", request: "audio", audio: WAV },
      { type: "transcript", text: "Yesterday I finish it" },
      hint(),
      { type: "sent", request: "audio", audio: WAV },
      { type: "transcript", text: "Yesterday I finishing it" },
      hint("Past form of finish."),
    );
    expect(state).toMatchObject({ hintStep: 2, hintFor: "I finish it" });

    state = sessionReducer(state, { type: "tutor", result: { kind: "reveal", message: "Say: I finished it.", selfCorrected: false } });
    expect(state.revealed).toBe(true);
  });

  it("keeps the mistake's type through the hints, adds its rule with the correct form, and clears both after", () => {
    const typed = (kind: "hint" | "reveal", extra = {}): SessionAction => ({
      type: "tutor",
      result: { kind, message: "…", selfCorrected: false, mistake: "I finish it", ...extra },
    });
    const rule = { name: "Past for finished actions", rule: "Ação terminada: passado." };
    let state = run(started, typed("hint", { mistakeType: "verb_tense" }), typed("hint"));
    expect(state).toMatchObject({ mistakeType: "verb_tense", rule: null });

    state = sessionReducer(state, typed("reveal", { mistakeType: "verb_tense", rule }));
    expect(state).toMatchObject({ mistakeType: "verb_tense", rule });

    state = sessionReducer(state, { type: "tutor", result: { kind: "reply", message: "Great.", selfCorrected: false } });
    expect(state).toMatchObject({ mistakeType: null, rule: null });
  });

  it("keeps the tutor's written support for the current turn only", () => {
    const withSupport: SessionAction = {
      type: "tutor",
      result: { kind: "reply", message: "Sure.", selfCorrected: false, support: "“Prazo” em inglês é “deadline”." },
    };
    let state = run(started, withSupport);
    expect(state.support).toBe("“Prazo” em inglês é “deadline”.");
    state = sessionReducer(state, hint());
    expect(state.support).toBeNull();
    state = run(started, withSupport, { type: "sent", request: "audio", audio: WAV });
    expect(state.support).toBeNull();
  });

  it("keeps the goals and the stop-or-keep-going question until the learner answers", () => {
    const asked: SessionAction = {
      type: "tutor",
      result: { kind: "reply", message: "Stop here?", selfCorrected: false, checkIn: true, coveredGoals: ["today"] },
    };
    let state = run({ ...started, goals: ["yesterday", "today"] } as SessionAction, asked);
    expect(state.goals).toEqual(["yesterday", "today"]);
    expect(state.coveredGoals).toEqual(["today"]);
    expect(state.checkIn).toBe(true);
    expect(sessionReducer(state, { type: "keep_going" }).checkIn).toBe(false);
    state = sessionReducer(state, { type: "sent", request: "audio", audio: WAV });
    expect(state.checkIn).toBe(false);
    expect(state.coveredGoals).toEqual(["today"]);
  });

  it("celebrates a fix after a hint and closes the ladder", () => {
    const state = run(
      started,
      { type: "sent", request: "audio", audio: WAV },
      hint(),
      { type: "sent", request: "audio", audio: WAV },
      { type: "tutor", result: { kind: "reply", message: "Right!", selfCorrected: true } },
    );
    expect(state).toMatchObject({ fixed: true, hintStep: 0, hintFor: null });
    expect(sessionReducer(state, { type: "sent", request: "audio", audio: WAV }).fixed).toBe(false);
  });

  it("says it didn't catch a turn without speech and listens again", () => {
    const state = run(started, { type: "sent", request: "audio", audio: WAV }, { type: "done" });
    expect(state).toMatchObject({ phase: "listening", missed: true });
    expect(sessionReducer(state, { type: "speech_start" }).missed).toBe(false);
  });

  it("treats a bad recording as 'didn't catch that', not as a failure", () => {
    const state = run(started, { type: "sent", request: "audio", audio: WAV }, { type: "failed", code: "bad_audio" });
    expect(state).toMatchObject({ phase: "listening", missed: true, failure: null });
  });

  it.each([
    ["before the transcript", [] as SessionAction[], { kind: "audio", audio: WAV }],
    ["after the transcript", [{ type: "transcript", text: "I fixed it" }] as SessionAction[], { kind: "text", text: "I fixed it" }],
    [
      "after the tutor answered",
      [{ type: "transcript", text: "I fixed it" }, hint()] as SessionAction[],
      { kind: "speak" },
    ],
  ])("remembers how to retry a failure %s", (_when, steps, retry) => {
    const state = run(started, { type: "sent", request: "audio", audio: WAV }, ...steps, { type: "failed", code: "voice_unavailable" });
    expect(state).toMatchObject({ phase: "failed", failure: "voice_unavailable", retry });
    // The trailing "done" does not hide the failure.
    expect(sessionReducer(state, { type: "done" }).phase).toBe("failed");
  });

  it("does not resend a recording that held no speech", () => {
    const missed = run(started, { type: "sent", request: "audio", audio: WAV }, { type: "done" });
    expect(missed.missed).toBe(true);
    expect(sessionReducer(missed, { type: "failed", code: "disconnected" }).retry).not.toMatchObject({ kind: "audio" });
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

  it("ignores a session that finishes starting after the learner ended it", () => {
    const state = run({ type: "pause" }, { type: "ending" }, { type: "ended", summary: null }, started);
    expect(state.phase).toBe("ended");
    expect(run({ type: "pause" }).phase).toBe("starting");
  });

  it("treats busy as out of band: the running request carries on", () => {
    const thinking = run(started, { type: "sent", request: "audio", audio: WAV });
    expect(sessionReducer(thinking, { type: "failed", code: "busy" })).toBe(thinking);
    const paused = sessionReducer(thinking, { type: "pause" });
    expect(sessionReducer(paused, { type: "failed", code: "busy" }).phase).toBe("paused");
  });

  it("resumes into thinking while the request is still open, and listens once it is done", () => {
    const paused = run(started, { type: "sent", request: "audio", audio: WAV }, { type: "pause" });
    expect(sessionReducer(paused, { type: "resume" }).phase).toBe("thinking");
    expect(run(started, { type: "sent", request: "audio", audio: WAV }, { type: "pause" }, { type: "done" }, { type: "resume" }).phase).toBe(
      "listening",
    );
  });

  it("does not start speaking while paused, and waits for done after playback", () => {
    const paused = run(started, { type: "sent", request: "speak" }, { type: "pause" }, { type: "speech" });
    expect(paused.phase).toBe("paused");
    const early = run(started, { type: "sent", request: "speak" }, { type: "speech" }, { type: "playback_end" });
    expect(early.phase).toBe("thinking");
    expect(sessionReducer(early, { type: "done" }).phase).toBe("listening");
  });

  it("keeps typed text for a retry when the send failed at once", () => {
    const state = run(started, { type: "done" }, { type: "sent", request: "text", text: "I fixed it" }, { type: "failed", code: "disconnected" });
    expect(state.retry).toEqual({ kind: "text", text: "I fixed it" });
  });

  it("does not caption a retried typed turn twice", () => {
    const state = run(
      started,
      { type: "sent", request: "audio", audio: WAV },
      { type: "transcript", text: "I fixed it" },
      { type: "failed", code: "tutor_unavailable" },
      { type: "sent", request: "text", text: "I fixed it" },
      { type: "transcript", text: "I fixed it" },
    );
    expect(state.captions.filter((c) => c.who === "you")).toHaveLength(1);
  });

  it("starts over cleanly after a start failure", () => {
    const failed = run({ type: "failed", code: "mic_blocked" });
    expect(sessionReducer(failed, { type: "restart" })).toEqual(run());
  });

  it("asks for a tap when audio is blocked, and clears it once speech plays", () => {
    const blocked = run(started, { type: "audio_blocked" });
    expect(blocked.audioBlocked).toBe(true);
    expect(sessionReducer(sessionReducer(blocked, { type: "sent", request: "speak" }), { type: "speech" }).audioBlocked).toBe(false);
  });

  it("ends with the number of saved mistakes", () => {
    const summary = { sessionId: "s1", mode: "daily", mistakes: [], selfCorrections: 0 } as unknown as SessionSummary;
    expect(run(started, { type: "ending" }, { type: "ended", summary })).toMatchObject({ phase: "ended", summary });
  });

  it("comes back paused after a reload, with the conversation, the goals and the hint step", () => {
    const state = run({
      type: "resumed",
      sessionId: "s1",
      captions: [
        { who: "tutor", text: "Morning!" },
        { who: "you", text: "I goed to the meeting" },
        { who: "tutor", text: "When did it happen?" },
      ],
      goals: ["yesterday", "today"],
      coveredGoals: ["yesterday"],
      hint: { hintsGiven: 1, revealed: false, mistake: "I goed" },
    });
    expect(state).toMatchObject({
      phase: "paused",
      sessionId: "s1",
      goals: ["yesterday", "today"],
      coveredGoals: ["yesterday"],
      hintStep: 1,
      hintFor: "I goed",
      revealed: false,
    });
    expect(state.captions).toHaveLength(3);
    // Resuming waits for the tutor to say its last line again, so the microphone stays off.
    expect(sessionReducer(state, { type: "resume" }).phase).toBe("thinking");
  });

  it("comes back on the correct form with the mistake's type and rule", () => {
    const rule = { name: "Past for finished actions", rule: "Passado." };
    const state = run({
      type: "resumed",
      sessionId: "s1",
      captions: [],
      goals: [],
      coveredGoals: [],
      hint: { hintsGiven: 2, revealed: true, mistake: "I goed", mistakeType: "verb_tense", rule },
    });
    expect(state).toMatchObject({ revealed: true, mistakeType: "verb_tense", rule });
  });

  it("only resumes a session that is still starting", () => {
    const state = run(started, { type: "resumed", sessionId: "s2", captions: [], goals: [], coveredGoals: [], hint: null });
    expect(state.sessionId).toBe("s1");
  });
});

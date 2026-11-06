import { describe, expect, it } from "vitest";
import { decide, type TutorVerdict } from "./correction-policy.js";
import type { Issue, PendingCorrection } from "./types.js";

const issue = (over: Partial<Issue> = {}): Issue => ({
  original: "Yesterday I fix the upload",
  correction: "Yesterday I fixed the upload",
  category: "verb tense",
  severity: "serious",
  hint: "Yesterday is in the past. Check your verb.",
  matchesKnownMistake: false,
  ...over,
});

const verdict = (over: Partial<TutorVerdict> = {}): TutorVerdict => ({
  reply: "Nice. What's next?",
  issues: [],
  pendingResolved: false,
  nextHint: null,
  ...over,
});

const pending = (over: Partial<PendingCorrection> = {}): PendingCorrection => ({
  original: "Yesterday I fix the upload",
  correction: "Yesterday I fixed the upload",
  category: "verb tense",
  hintsGiven: 1,
  revealed: false,
  ...over,
});

describe("decide", () => {
  it("goes on with the conversation when there are no mistakes", () => {
    const d = decide(null, verdict());
    expect(d).toEqual({ kind: "reply", message: "Nice. What's next?", nextPending: null, selfCorrected: false });
  });

  it("only records a minor mistake and goes on", () => {
    const d = decide(null, verdict({ issues: [issue({ severity: "minor" })] }));
    expect(d.kind).toBe("reply");
    expect(d.nextPending).toBeNull();
  });

  it("pauses on a serious mistake with a hint, not the answer", () => {
    const d = decide(null, verdict({ issues: [issue()] }));
    expect(d.kind).toBe("hint");
    expect(d.message).toBe("Yesterday is in the past. Check your verb.");
    expect(d.nextPending).toMatchObject({ hintsGiven: 1, revealed: false, correction: "Yesterday I fixed the upload" });
  });

  it("treats a minor mistake already in the bank as serious", () => {
    const d = decide(null, verdict({ issues: [issue({ severity: "minor", matchesKnownMistake: true })] }));
    expect(d.kind).toBe("hint");
  });

  it("gives a second hint after the first failed attempt", () => {
    const d = decide(pending(), verdict({ nextHint: "Add -ed to the verb." }));
    expect(d.kind).toBe("hint");
    expect(d.message).toBe("Add -ed to the verb.");
    expect(d.nextPending?.hintsGiven).toBe(2);
  });

  it("shows the correct form after two hints and asks to repeat", () => {
    const d = decide(pending({ hintsGiven: 2 }), verdict({ nextHint: "Another clue" }));
    expect(d.kind).toBe("reveal");
    expect(d.message).toContain("Yesterday I fixed the upload");
    expect(d.nextPending?.revealed).toBe(true);
  });

  it("resumes and marks a self-correction when the learner fixes it", () => {
    const d = decide(pending(), verdict({ pendingResolved: true }));
    expect(d).toMatchObject({ kind: "reply", nextPending: null, selfCorrected: true });
  });

  it("resumes after the repeat request, whatever the learner said", () => {
    const d = decide(pending({ hintsGiven: 2, revealed: true }), verdict({ pendingResolved: false }));
    expect(d).toMatchObject({ kind: "reply", nextPending: null, selfCorrected: false });
  });

  it("does not start a new correction while one is pending", () => {
    const d = decide(pending(), verdict({ pendingResolved: true, issues: [issue({ original: "other" })] }));
    expect(d.kind).toBe("reply");
    expect(d.nextPending).toBeNull();
  });
});

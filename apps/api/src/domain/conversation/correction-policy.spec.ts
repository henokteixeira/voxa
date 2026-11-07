import { describe, expect, it } from "vitest";
import { decide, safeHint, type TutorVerdict, verdictForMode } from "./correction-policy.js";
import type { Issue, PendingCorrection } from "./types.js";

const issue = (over: Partial<Issue> = {}): Issue => ({
  original: "Yesterday I fix the upload",
  correction: "Yesterday I fixed the upload",
  category: "verb tense",
  severity: "serious",
  hint: "Yesterday is in the past. Check your verb.",
  matchesKnownMistake: false,
  pattern: null,
  ...over,
});

const verdict = (over: Partial<TutorVerdict> = {}): TutorVerdict => ({
  reply: "Nice. What's next?",
  issues: [],
  pendingResolved: false,
  nextHint: null,
  correctUses: [],
  newWords: [],
  support: null,
  coveredGoals: [],
  stuck: false,
  scaffold: null,
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
    expect(d.message).toBe('Here is one way to say it: "Yesterday I fixed the upload". Try saying it yourself.');
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

  it("still gives the second hint when the tutor returns none", () => {
    const d = decide(pending(), verdict({ nextHint: null }));
    expect(d.kind).toBe("hint");
    expect(d.message).toBe("Let's try that once more. Look at the verb tense in that sentence.");
    expect(d.nextPending?.hintsGiven).toBe(2);
  });

  it("keeps the pending correction when the learner fails again with a new mistake", () => {
    const d = decide(pending(), verdict({ nextHint: "Add -ed.", issues: [issue({ original: "other", correction: "x" })] }));
    expect(d.kind).toBe("hint");
    expect(d.nextPending?.original).toBe("Yesterday I fix the upload");
  });

  it("resolves normally when fixed after the second hint", () => {
    const d = decide(pending({ hintsGiven: 2 }), verdict({ pendingResolved: true }));
    expect(d).toMatchObject({ kind: "reply", nextPending: null, selfCorrected: true });
  });

  it("does not start a new correction right after the repeat request", () => {
    const d = decide(pending({ hintsGiven: 2, revealed: true }), verdict({ issues: [issue({ original: "other" })] }));
    expect(d.kind).toBe("reply");
    expect(d.nextPending).toBeNull();
  });

  it("goes on with the tutor's reply for a minor mistake", () => {
    const d = decide(null, verdict({ issues: [issue({ severity: "minor" })] }));
    expect(d.message).toBe("Nice. What's next?");
  });
});

describe("safeHint", () => {
  const target = { correction: "Yesterday I fixed the upload", category: "verb tense" };

  it("keeps a hint that does not give the answer away", () => {
    expect(safeHint("Yesterday is in the past.", target)).toBe("Yesterday is in the past.");
  });

  it("replaces a hint that contains the corrected sentence", () => {
    expect(safeHint('Say "yesterday I fixed the upload".', target)).toContain("Look at the verb tense");
  });

  it("reads a category name aloud without underscores", () => {
    expect(safeHint("", { correction: "x", category: "word_choice" })).toContain("Look at the word choice");
  });

  it("replaces an empty hint", () => {
    expect(safeHint("  ", target)).toContain("Look at the verb tense");
  });
});

describe("verdictForMode", () => {
  const serious = {
    original: "I goed",
    correction: "I went",
    category: "grammar",
    severity: "serious" as const,
    hint: "Past tense?",
    matchesKnownMistake: true,
    pattern: null,
  };
  const v = { reply: "Go on.", issues: [serious], pendingResolved: false, nextHint: null, correctUses: [], newWords: [], support: null, coveredGoals: [], stuck: false, scaffold: null };

  it("keeps the verdict in the meeting modes", () => {
    expect(verdictForMode("daily", v)).toBe(v);
  });

  it("makes every mistake minor in the placement interview, so it never pauses for a hint", () => {
    const observed = verdictForMode("placement", v);
    expect(observed.issues).toEqual([{ ...serious, severity: "minor", matchesKnownMistake: false }]);
    expect(decide(null, observed).kind).toBe("reply");
  });
});

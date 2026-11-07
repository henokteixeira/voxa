import { describe, expect, it } from "vitest";
import type { SessionMistake } from "../ports/mistake.repository.js";
import { chooseTakeaways } from "./takeaways.js";

const mistake = (patternId: string | null, over: Partial<SessionMistake> = {}): SessionMistake => ({
  original: `said ${patternId}`,
  correction: "right",
  category: "verb_tense",
  severity: "minor",
  selfCorrected: false,
  occurrences: 1,
  pattern: patternId ? { key: patternId, name: `name ${patternId}`, rule: `rule ${patternId}` } : null,
  patternId,
  patternSeenBefore: false,
  ...over,
});

describe("chooseTakeaways", () => {
  it("keeps at most three patterns: serious, then repeated, then seen before, then in order", () => {
    const picked = chooseTakeaways([
      mistake("a"),
      mistake("b"),
      mistake("c", { patternSeenBefore: true }),
      mistake("d"),
      mistake("d"),
      mistake("e", { severity: "serious" }),
    ]);
    expect(picked.map((t) => t.patternId)).toEqual(["e", "d", "c"]);
  });

  it("shows the words of the serious time a pattern was broken", () => {
    const [first] = chooseTakeaways([mistake("a"), mistake("a", { original: "I goed", severity: "serious" })]);
    expect(first).toEqual({ patternId: "a", category: "verb_tense", name: "name a", rule: "rule a", said: "I goed" });
  });

  it("leaves out new words and mistakes without a pattern", () => {
    expect(chooseTakeaways([mistake(null), mistake("w", { category: "new_word" })])).toEqual([]);
  });
});

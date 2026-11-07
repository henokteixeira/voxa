import { describe, expect, it } from "vitest";
import type { BankEntry } from "../ports/mistake-bank.repository.js";
import { choosePracticeTargets, metTargetsAfter } from "./practice-targets.js";

const target = (original: string) => ({ original, correction: `${original}!`, category: "grammar" });

describe("choosePracticeTargets", () => {
  it("takes the two most frequent mistakes not mastered yet, never new words", () => {
    const entry = (original: string, occurrences: number, extra: Partial<BankEntry> = {}) =>
      ({ ...target(original), occurrences, sessionsCorrect: 0, ...extra }) as BankEntry;
    const chosen = choosePracticeTargets([
      entry("rare", 1),
      entry("word", 9, { category: "new_word" }),
      entry("mastered", 8, { sessionsCorrect: 99 }),
      entry("often", 5),
      entry("sometimes", 3),
    ]);
    expect(chosen.map((t) => t.original)).toEqual(["often", "sometimes"]);
  });

  it("starts with patterns due for review, one sentence each, then one per other pattern", () => {
    const entry = (original: string, occurrences: number, patternId: string | null) =>
      ({ ...target(original), occurrences, sessionsCorrect: 0, patternId }) as BankEntry;
    const entries = [entry("often", 9, "p-not-due"), entry("also often", 8, "p-not-due"), entry("due a", 2, "p-due"), entry("due b", 3, "p-due")];

    expect(choosePracticeTargets(entries, new Set(["p-due"])).map((t) => t.original)).toEqual(["due b", "often"]);
    expect(choosePracticeTargets(entries).map((t) => t.original)).toEqual(["often", "also often"]);
  });
});

describe("metTargetsAfter", () => {
  const targets = [target("I am agree"), target("he go")];

  it("adds a target said correctly and keeps the ones already met", () => {
    expect(metTargetsAfter({ targets, alreadyMet: ["he go"], correctUses: ["I am agree."], pending: null })).toEqual([
      "I am agree",
      "he go",
    ]);
  });

  it("does not count the retry after a hint", () => {
    const pending = { ...target("I am agree"), hintsGiven: 1, revealed: false } as never;
    expect(metTargetsAfter({ targets, alreadyMet: [], correctUses: ["I am agree"], pending })).toEqual([]);
  });
});

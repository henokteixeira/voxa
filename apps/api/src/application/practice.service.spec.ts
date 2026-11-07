import { describe, expect, it } from "vitest";
import type { BankEntry, MistakeBankRepository } from "../domain/ports/mistake-bank.repository.js";
import type { ReviewRepository, ReviewSchedule } from "../domain/ports/review.repository.js";
import { PracticeService } from "./practice.service.js";

const seen = new Date("2026-11-07T10:00:00Z");
const day = (n: number) => new Date(seen.getTime() + n * 86_400_000);
const past = { key: "past_simple", name: "Past for finished actions", rule: "Ação terminada: passado." };
const waitFor = { key: "wait_for", name: "Wait for", rule: "Esperar algo: wait for." };

const entry = (id: string, over: Partial<BankEntry> = {}): BankEntry => ({
  id,
  language: "en",
  original: `said ${id}`,
  correction: `right ${id}`,
  category: "verb_tense",
  occurrences: 1,
  lastSeenAt: seen,
  patternId: null,
  sessionsCorrect: 0,
  pattern: null,
  ...over,
});

function service(entries: BankEntry[], schedules: ReviewSchedule[]) {
  const bank = { list: async () => entries } as unknown as MistakeBankRepository;
  const reviews = { schedules: async () => schedules } as unknown as ReviewRepository;
  return new PracticeService(bank, reviews);
}

describe("PracticeService", () => {
  it("groups sentences under their pattern, with its schedule, types in order and mastered last", async () => {
    const view = await service(
      [
        entry("w1", { category: "articles_prepositions", patternId: "p-wait", pattern: waitFor }),
        entry("m1", { patternId: "p-past", pattern: past, occurrences: 2 }),
        entry("m2", { patternId: "p-past", pattern: past, occurrences: 3 }),
        entry("m3", { patternId: "p-will", pattern: { key: "will", name: "Will", rule: "Will." } }),
      ],
      [
        { subject: { kind: "pattern", id: "p-past" }, step: 3, dueAt: day(14) },
        { subject: { kind: "pattern", id: "p-wait" }, step: 0, dueAt: day(1) },
      ],
    ).view("en");

    expect(view.patterns.map((p) => [p.id, p.status, p.dueAt])).toEqual([
      ["p-will", "new", null],
      ["p-past", "mastered", day(14)],
      ["p-wait", "new", day(1)],
    ]);
    const pastView = view.patterns[1];
    expect(pastView).toMatchObject({ category: "verb_tense", name: past.name, rule: past.rule, occurrences: 5 });
    expect(pastView.sentences.map((s) => s.id)).toEqual(["m1", "m2"]);
  });

  it("lists new words with their schedule, and mistakes from before patterns on their own", async () => {
    const view = await service(
      [entry("n1", { category: "new_word", original: "prazo", correction: "deadline" }), entry("old")],
      [{ subject: { kind: "new_word", id: "n1" }, step: 1, dueAt: day(3) }],
    ).view("en");

    expect(view.newWords).toEqual([{ id: "n1", word: "deadline", said: "prazo", status: "improving", dueAt: day(3) }]);
    expect(view.earlier).toEqual([{ id: "old", category: "verb_tense", original: "said old", correction: "right old", occurrences: 1 }]);
    expect(view.patterns).toEqual([]);
  });
});

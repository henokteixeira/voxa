import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DrizzleMistakeRepository } from "./drizzle-mistake.repository.js";
import { DrizzleReviewRepository } from "./drizzle-review.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { createTestDatabase } from "./test-database.js";

let close: () => Promise<void>;
let sessions: DrizzleSessionRepository;
let mistakes: DrizzleMistakeRepository;
let reviews: DrizzleReviewRepository;

beforeEach(async () => {
  const test = await createTestDatabase();
  close = test.close;
  sessions = new DrizzleSessionRepository(test.db);
  mistakes = new DrizzleMistakeRepository(test.db);
  reviews = new DrizzleReviewRepository(test.db);
});
afterEach(() => close());

const now = new Date("2026-11-07T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);
const past = { key: "past_simple", name: "Past for finished actions", rule: "Ação terminada: passado." };

async function bank() {
  const s = await sessions.create({ language: "en", mode: "daily" });
  const goed = await mistakes.record(
    { language: "en", original: "I goed", correction: "I went", category: "verb_tense", pattern: past },
    { sessionId: s.id, severity: "serious" },
  );
  const fix = await mistakes.record(
    { language: "en", original: "I fix it yesterday", correction: "I fixed it yesterday", category: "verb_tense", pattern: past },
    { sessionId: s.id, severity: "minor" },
  );
  const word = await mistakes.record(
    { language: "en", original: "prazo", correction: "deadline", category: "new_word", pattern: null },
    { sessionId: s.id, severity: "minor" },
  );
  return { goed: goed!, fix: fix!, word: word! };
}

describe("DrizzleReviewRepository", () => {
  it("saves and replaces a subject's schedule", async () => {
    const { goed } = await bank();
    const subject = { kind: "pattern" as const, id: goed.patternId! };
    expect(await reviews.state(subject)).toBeNull();

    await reviews.save("en", subject, { step: 0, dueAt: day(1) }, null);
    await reviews.save("en", subject, { step: 1, dueAt: day(3) }, now);

    expect(await reviews.state(subject)).toEqual({ step: 1, dueAt: day(3) });
  });

  it("lists due patterns with their sentences and due new words, longest overdue first", async () => {
    const { goed, word } = await bank();
    await reviews.save("en", { kind: "new_word", id: word.id }, { step: 0, dueAt: day(-2) }, null);
    await reviews.save("en", { kind: "pattern", id: goed.patternId! }, { step: 2, dueAt: day(-1) }, null);

    const due = await reviews.due("en", now, 5);

    expect(due.map((d) => [d.subject.kind, d.name, d.rule])).toEqual([
      ["new_word", "deadline", "prazo"],
      ["pattern", "Past for finished actions", "Ação terminada: passado."],
    ]);
    expect(due[1]).toMatchObject({ category: "verb_tense", step: 2 });
    expect(due[1].examples.map((e) => e.original).toSorted()).toEqual(["I fix it yesterday", "I goed"]);
    expect(await reviews.due("en", now, 1)).toHaveLength(1);
    expect(await reviews.due("es", now, 5)).toEqual([]);
  });

  it("skips what is not due yet, dismissed words and patterns left without mistakes", async () => {
    const { goed, fix, word } = await bank();
    await reviews.save("en", { kind: "pattern", id: goed.patternId! }, { step: 0, dueAt: day(-1) }, null);
    await reviews.save("en", { kind: "new_word", id: word.id }, { step: 0, dueAt: day(-1) }, null);
    await mistakes.dismiss(goed.id, "both_correct");
    await mistakes.dismiss(fix.id, "transcript_error");
    await mistakes.dismiss(word.id, "not_needed");

    expect(await reviews.due("en", now, 5)).toEqual([]);
  });

  it("finds one item, due or not, unless its mistakes were dismissed", async () => {
    const { word } = await bank();
    const subject = { kind: "new_word" as const, id: word.id };
    expect(await reviews.item(subject)).toBeNull();
    await reviews.save("en", subject, { step: 2, dueAt: day(5) }, null);

    expect(await reviews.item(subject)).toMatchObject({ name: "deadline", rule: "prazo", step: 2, dueAt: day(5) });
    await mistakes.dismiss(word.id, "not_needed");
    expect(await reviews.item(subject)).toBeNull();
  });

  it("says when the next item comes back", async () => {
    const { goed, fix, word } = await bank();
    expect(await reviews.nextDueAt("en", now)).toBeNull();
    await reviews.save("en", { kind: "pattern", id: goed.patternId! }, { step: 1, dueAt: day(3) }, null);
    await reviews.save("en", { kind: "new_word", id: word.id }, { step: 0, dueAt: day(1) }, null);

    expect(await reviews.nextDueAt("en", now)).toEqual(day(1));

    await mistakes.dismiss(word.id, "not_needed");
    expect(await reviews.nextDueAt("en", now)).toEqual(day(3));

    await mistakes.dismiss(goed.id, "both_correct");
    await mistakes.dismiss(fix.id, "both_correct");
    expect(await reviews.nextDueAt("en", now)).toBeNull();
  });
});

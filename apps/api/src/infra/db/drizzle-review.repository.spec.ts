import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DrizzleMissionRepository } from "./drizzle-mission.repository.js";
import { DrizzleMistakeRepository } from "./drizzle-mistake.repository.js";
import { DrizzleReviewRepository } from "./drizzle-review.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { createTestDatabase } from "./test-database.js";

let close: () => Promise<void>;
let sessions: DrizzleSessionRepository;
let mistakes: DrizzleMistakeRepository;
let reviews: DrizzleReviewRepository;
let missions: DrizzleMissionRepository;

beforeEach(async () => {
  const test = await createTestDatabase();
  close = test.close;
  sessions = new DrizzleSessionRepository(test.db, test.learnerId);
  mistakes = new DrizzleMistakeRepository(test.db, test.learnerId);
  reviews = new DrizzleReviewRepository(test.db, test.learnerId);
  missions = new DrizzleMissionRepository(test.db, test.learnerId);
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

/** A mission's expression, as step 2 adds it to the review. */
async function expression() {
  const { id } = await missions.create({ language: "en", day: "2026-11-07", situation: "daily", createdAt: now });
  const model = await missions.saveModel(id, {
    speaker: "Alex",
    text: "I'm blocked by the API keys.",
    expressions: [1, 2, 3].map((position) => ({ position, phrase: `I'm blocked by… ${position}`, example: "I'm blocked by the API keys." })),
  });
  return model.expressions[0];
}

describe("DrizzleReviewRepository", () => {
  it("reviews a mission's expression like any item, with its card and schedule", async () => {
    const taken = await expression();
    const subject = { kind: "expression" as const, id: taken.id };
    await reviews.save("en", subject, { step: 0, dueAt: day(-1) }, null);

    expect(await reviews.due("en", now, 5)).toEqual([
      { subject, language: "en", category: "expression", name: taken.phrase, rule: taken.example, examples: [], step: 0, dueAt: day(-1) },
    ]);
    expect(await reviews.schedules("en")).toEqual([{ subject, step: 0, dueAt: day(-1) }]);
    const card = await reviews.addCard(subject, { cue: "Estou travado pelo deploy.", answer: "I'm blocked by the deploy." });
    expect((await reviews.card(card.id))?.subject).toEqual(subject);

    await reviews.save("en", subject, { step: 1, dueAt: day(2) }, now);
    expect(await reviews.state(subject)).toEqual({ step: 1, dueAt: day(2) });
    expect(await reviews.nextDueAt("en", now)).toEqual(day(2));
  });

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

  it("asks for mistakes and new words before expressions, and can list one kind", async () => {
    const { goed } = await bank();
    const taken = await expression();
    await reviews.save("en", { kind: "expression", id: taken.id }, { step: 0, dueAt: day(-3) }, null);
    await reviews.save("en", { kind: "pattern", id: goed.patternId! }, { step: 0, dueAt: day(-1) }, null);

    expect((await reviews.due("en", now, 1)).map((d) => d.subject.kind)).toEqual(["pattern"]);
    expect((await reviews.due("en", now, 5)).map((d) => d.subject.kind)).toEqual(["pattern", "expression"]);
    expect((await reviews.due("en", now, 5, "expression")).map((d) => d.subject.id)).toEqual([taken.id]);
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

  it("keeps a card and records its answer only once", async () => {
    const { word } = await bank();
    const subject = { kind: "new_word" as const, id: word.id };
    await reviews.save("en", subject, { step: 0, dueAt: day(-1) }, null);

    const card = await reviews.addCard(subject, { cue: "Qual é o prazo?", answer: "What is the deadline?" });
    expect(await reviews.card(card.id)).toEqual({ ...card, recalled: null });
    expect(await reviews.answerCard(card.id, true, now)).toBe(true);
    expect(await reviews.answerCard(card.id, false, now)).toBe(false);
    expect((await reviews.card(card.id))?.recalled).toBe(true);
    expect(await reviews.answeredSince("en", day(-1))).toEqual([{ cardId: card.id, itemId: expect.any(String), answeredAt: now }]);
    expect(await reviews.answeredSince("en", day(1))).toEqual([]);
    expect(await reviews.answeredSince("es", day(-1))).toEqual([]);
  });

  it("lists every schedule in a language", async () => {
    const { goed, word } = await bank();
    await reviews.save("en", { kind: "pattern", id: goed.patternId! }, { step: 1, dueAt: day(3) }, null);
    await reviews.save("en", { kind: "new_word", id: word.id }, { step: 0, dueAt: day(1) }, null);

    expect((await reviews.schedules("en")).toSorted((a, b) => a.step - b.step)).toEqual([
      { subject: { kind: "new_word", id: word.id }, step: 0, dueAt: day(1) },
      { subject: { kind: "pattern", id: goed.patternId }, step: 1, dueAt: day(3) },
    ]);
    expect(await reviews.schedules("es")).toEqual([]);
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

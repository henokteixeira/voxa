import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../../domain/ports/review.repository.js";
import { buildCheckMessage, buildCueMessage, buildCuePrompt } from "./review-prompts.js";

const pattern: ReviewItem = {
  subject: { kind: "pattern", id: "p1" },
  language: "en",
  category: "verb_tense",
  name: "Past for finished actions",
  rule: "Ação terminada: passado.",
  examples: [{ original: "I goed", correction: "I went" }],
  step: 0,
  dueAt: new Date(),
};

describe("review prompts", () => {
  it("asks for a cue in the first language that differs from the learner's sentences", () => {
    expect(buildCuePrompt("en", "pt-BR")).toContain("in pt-BR");
    const message = buildCueMessage(pattern, "Works on Oral Collector.");
    expect(message).toContain("Past for finished actions (verb_tense): Ação terminada: passado.");
    expect(message).toContain('- "I goed" → "I went"');
    expect(message).toContain("Works on Oral Collector.");
  });

  it("describes a new word by what the learner said", () => {
    const word = { ...pattern, subject: { kind: "new_word" as const, id: "w1" }, category: "new_word", name: "deadline", rule: "prazo" };
    expect(buildCueMessage(word, "")).toContain('"deadline" (the learner once said "prazo"');
  });

  it("gives the checker the cue, one good answer and the learner's answer", () => {
    const message = buildCheckMessage(pattern, { cue: "Eu fui ontem.", answer: "I went yesterday." }, "I go yesterday");
    expect(message).toContain("<cue>\nEu fui ontem.\n</cue>");
    expect(message).toContain("<learner_answer>\nI go yesterday\n</learner_answer>");
  });
});

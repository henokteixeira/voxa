import { describe, expect, it, vi } from "vitest";
import { testConfig } from "../../config/testing.js";
import type { ReviewItem } from "../../domain/ports/review.repository.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { AnthropicReviewCoach } from "./anthropic-review-coach.js";
import type { AnthropicMessages } from "./anthropic-tutor.adapter.js";

const item: ReviewItem = {
  subject: { kind: "pattern", id: "p1" },
  language: "en",
  category: "verb_tense",
  name: "Past for finished actions",
  rule: "Ação terminada: passado.",
  examples: [],
  step: 0,
  dueAt: new Date(),
};

function coach(response: object) {
  const parse = vi.fn().mockResolvedValue(response);
  return { coach: new AnthropicReviewCoach({ parse } as unknown as AnthropicMessages, testConfig()), parse };
}

describe("AnthropicReviewCoach", () => {
  it("returns the trimmed cue and answer", async () => {
    const { coach: c } = coach({ stop_reason: "end_turn", parsed_output: { cue: " Eu fui ontem. ", answer: " I went yesterday. " } });
    expect(await c.cue(item, "")).toEqual({ cue: "Eu fui ontem.", answer: "I went yesterday." });
  });

  it("fails on an empty cue, a refusal or a cut-off answer", async () => {
    await expect(coach({ stop_reason: "end_turn", parsed_output: { cue: " ", answer: "x" } }).coach.cue(item, "")).rejects.toBeInstanceOf(TutorUnavailableError);
    await expect(coach({ stop_reason: "refusal", parsed_output: null }).coach.check(item, { cue: "a", answer: "b" }, "c")).rejects.toBeInstanceOf(TutorUnavailableError);
    await expect(coach({ stop_reason: "max_tokens", parsed_output: null }).coach.cue(item, "")).rejects.toBeInstanceOf(TutorUnavailableError);
  });

  it("reads whether the answer was recalled", async () => {
    const { coach: c, parse } = coach({ stop_reason: "end_turn", parsed_output: { recalled: true } });
    expect(await c.check(item, { cue: "Eu fui ontem.", answer: "I went yesterday." }, "I went yesterday")).toBe(true);
    expect(parse.mock.calls[0][0].messages[0].content).toContain("<learner_answer>\nI went yesterday\n</learner_answer>");
  });
});

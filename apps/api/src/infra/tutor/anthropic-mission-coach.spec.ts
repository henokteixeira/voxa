import { describe, expect, it, vi } from "vitest";
import { testConfig } from "../../config/testing.js";
import type { ModelRequest } from "../../domain/ports/mission-coach.port.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { AnthropicMissionCoach } from "./anthropic-mission-coach.js";
import type { AnthropicMessages } from "./anthropic-tutor.adapter.js";

const request: ModelRequest = { situation: "daily", language: "en", step: "build_light", learnerContext: "Works on Oral Collector." };
const text =
  "Hi, I'm Alex. Yesterday I fixed the login bug. Today I'm still working on the reports page, it needs one more filter. " +
  "I'm blocked by the API keys. So I need help from the infra team. By the end of the day, I'll ship it.";
const expressions = [
  { phrase: " Yesterday I… ", example: " Yesterday I fixed the login bug. " },
  { phrase: "I'm blocked by…", example: "I'm blocked by the API keys." },
  { phrase: "By the end of the day, I'll…", example: "By the end of the day, I'll ship it." },
];

function coach(parsed_output: object | null, stop_reason = "end_turn") {
  const parse = vi.fn().mockResolvedValue({ stop_reason, parsed_output });
  return { coach: new AnthropicMissionCoach({ parse } as unknown as AnthropicMessages, testConfig()), parse };
}

const fails = (output: object | null, stop?: string) =>
  expect(coach(output, stop).coach.model(request)).rejects.toBeInstanceOf(TutorUnavailableError);

describe("AnthropicMissionCoach", () => {
  it("returns the trimmed model with its expressions numbered", async () => {
    const { coach: c, parse } = coach({ speaker: " Alex ", text: ` ${text} `, expressions });
    const model = await c.model(request);
    expect(model.speaker).toBe("Alex");
    expect(model.text).toBe(text);
    expect(model.expressions[0]).toEqual({ position: 1, phrase: "Yesterday I…", example: "Yesterday I fixed the login bug." });
    expect(model.expressions.map((e) => e.position)).toEqual([1, 2, 3]);

    const message = parse.mock.calls[0][0].messages[0].content;
    expect(message).toContain("daily stand-up");
    expect(message).toContain("CEFR A2");
    expect(message).toContain("Works on Oral Collector.");
  });

  it("fails when the text is empty, too short or too long, and on a cut-off answer", async () => {
    await fails({ speaker: "Alex", text: " ", expressions });
    await fails({ speaker: "Alex", text: "Yesterday I fixed the login bug.", expressions });
    await fails({ speaker: "Alex", text: `${text} ${"word ".repeat(300)}`, expressions });
    await fails(null, "max_tokens");
  });

  it("fails unless there are 3 different expressions, each with room for the learner's words and an example from the text", async () => {
    await fails({ speaker: "Alex", text, expressions: expressions.slice(0, 2) });
    await fails({ speaker: "Alex", text, expressions: [...expressions.slice(0, 2), { phrase: " ", example: "x" }] });
    await fails({ speaker: "Alex", text, expressions: [...expressions.slice(0, 2), { phrase: "I'm blocked", example: "I'm blocked by the API keys." }] });
    await fails({ speaker: "Alex", text, expressions: [...expressions.slice(0, 2), { phrase: "I'm blocked by…", example: "I'm blocked by the API keys." }] });
    await fails({ speaker: "Alex", text, expressions: [...expressions.slice(0, 2), { phrase: "I need…", example: "I need a coffee." }] });
  });
});

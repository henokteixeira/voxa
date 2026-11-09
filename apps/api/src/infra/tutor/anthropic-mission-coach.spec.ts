import { describe, expect, it, vi } from "vitest";
import { testConfig } from "../../config/testing.js";
import type { ModelRequest } from "../../domain/ports/mission-coach.port.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { AnthropicMissionCoach } from "./anthropic-mission-coach.js";
import type { AnthropicMessages } from "./anthropic-tutor.adapter.js";

const request: ModelRequest = { situation: "daily", language: "en", step: "build_light", learnerContext: "Works on Oral Collector." };
const expressions = [
  { phrase: " Yesterday I… ", example: " Yesterday I fixed the login bug. " },
  { phrase: "I'm blocked by…", example: "I'm blocked by the API keys." },
  { phrase: "By the end of the day, I'll…", example: "By the end of the day, I'll ship it." },
];

function coach(parsed_output: object | null, stop_reason = "end_turn") {
  const parse = vi.fn().mockResolvedValue({ stop_reason, parsed_output });
  return { coach: new AnthropicMissionCoach({ parse } as unknown as AnthropicMessages, testConfig()), parse };
}

describe("AnthropicMissionCoach", () => {
  it("returns the trimmed model with its expressions numbered", async () => {
    const { coach: c, parse } = coach({ speaker: " Alex ", text: " Yesterday I fixed the login bug. ", expressions });
    const model = await c.model(request);
    expect(model.speaker).toBe("Alex");
    expect(model.text).toBe("Yesterday I fixed the login bug.");
    expect(model.expressions[0]).toEqual({ position: 1, phrase: "Yesterday I…", example: "Yesterday I fixed the login bug." });
    expect(model.expressions.map((e) => e.position)).toEqual([1, 2, 3]);

    const message = parse.mock.calls[0][0].messages[0].content;
    expect(message).toContain("daily stand-up");
    expect(message).toContain("CEFR A2");
    expect(message).toContain("Works on Oral Collector.");
  });

  it("fails without exactly 3 complete expressions, on an empty or too long text, and on a cut-off answer", async () => {
    const fails = (output: object | null, stop?: string) => expect(coach(output, stop).coach.model(request)).rejects.toBeInstanceOf(TutorUnavailableError);
    await fails({ speaker: "Alex", text: "Hi.", expressions: expressions.slice(0, 2) });
    await fails({ speaker: "Alex", text: "Hi.", expressions: [...expressions.slice(0, 2), { phrase: " ", example: "x" }] });
    await fails({ speaker: "Alex", text: " ", expressions });
    await fails({ speaker: "Alex", text: "word ".repeat(400), expressions });
    await fails(null, "max_tokens");
  });
});

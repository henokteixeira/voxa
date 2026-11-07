import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testConfig } from "../../config/testing.js";
import type { LearnerFact } from "../../domain/memory/learner-fact.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { AnthropicMemoryExtractor } from "./anthropic-memory-extractor.js";
import type { AnthropicMessages } from "./anthropic-tutor.adapter.js";
import { buildMemoryPrompt } from "./memory-prompts.js";

const turns = [
  { role: "assistant" as const, content: "What do you do?" },
  { role: "user" as const, content: "I work in Joqum, I am developer of app for Bible translation." },
];
const known: LearnerFact = {
  id: "fact-1",
  topic: "projects",
  statement: "Works on the Oral Collector app.",
  language: "en",
  sourceSessionId: null,
  learnedAt: new Date("2026-11-06T10:00:00Z"),
  updatedAt: new Date("2026-11-06T10:00:00Z"),
};

function extractorReturning(response: object) {
  const parse = vi.fn().mockResolvedValue(response);
  return { extractor: new AnthropicMemoryExtractor({ parse } as unknown as AnthropicMessages, testConfig()), parse };
}

beforeEach(() => {
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
});

describe("AnthropicMemoryExtractor", () => {
  it("sends the known facts and the transcript, and returns the cleaned memory", async () => {
    const { extractor, parse } = extractorReturning({
      stop_reason: "end_turn",
      parsed_output: {
        recap: " Talked about   his work. ",
        added: [
          { topic: "work", statement: "Works at Joqum as a developer." },
          { topic: "work", statement: "works at joqum as a developer." }, // the same fact twice
          { topic: "life", statement: "  " },
        ],
        updated: [
          { id: "fact-1", statement: "Works on a Bible translation app." },
          { id: "made-up", statement: "Not a known fact." },
        ],
      },
    });

    await expect(extractor.extract({ language: "en", mode: "placement", turns, known: [known] })).resolves.toEqual({
      recap: "Talked about his work.",
      added: [{ topic: "work", statement: "Works at Joqum as a developer." }],
      updated: [{ id: "fact-1", statement: "Works on a Bible translation app." }],
    });
    const params = parse.mock.calls[0][0];
    expect(params.system).toBe(buildMemoryPrompt());
    expect(params.messages[0].content).toContain("- fact-1 (projects): Works on the Oral Collector app.");
    expect(params.messages[0].content).toContain("Learner: I work in Joqum");
  });

  it("fails as unavailable when the answer did not complete", async () => {
    const { extractor } = extractorReturning({ stop_reason: "max_tokens", parsed_output: null });
    await expect(extractor.extract({ language: "en", mode: "daily", turns, known: [] })).rejects.toBeInstanceOf(TutorUnavailableError);
  });
});

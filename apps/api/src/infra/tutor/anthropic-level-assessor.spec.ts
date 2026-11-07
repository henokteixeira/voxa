import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testConfig } from "../../config/testing.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { AnthropicLevelAssessor } from "./anthropic-level-assessor.js";
import type { AnthropicMessages } from "./anthropic-tutor.adapter.js";
import { buildAssessmentPrompt, buildTranscript } from "./level-prompts.js";

const config = testConfig();
const turns = [
  { role: "assistant" as const, content: "What do you do?" },
  { role: "user" as const, content: "I am developer, I work in app for translate bible." },
  { role: "assistant" as const, content: "What did you do yesterday?" },
  { role: "user" as const, content: "Yesterday I fix one bug in the upload, because the file is big." },
];

function assessorReturning(response: object) {
  const parse = vi.fn().mockResolvedValue(response);
  const assessor = new AnthropicLevelAssessor({ parse } as unknown as AnthropicMessages, config);
  return { assessor, parse };
}

beforeEach(() => {
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
});

describe("AnthropicLevelAssessor", () => {
  it("sends the transcript with the CEFR descriptors and returns the level", async () => {
    const { assessor, parse } = assessorReturning({
      stop_reason: "end_turn",
      parsed_output: { level: "A2", evidence: ["Yesterday I fix one bug in the upload, because the file is big"] },
    });
    await expect(assessor.assess({ language: "en", turns })).resolves.toEqual({
      level: "A2",
      evidence: ["Yesterday I fix one bug in the upload, because the file is big"],
    });
    const params = parse.mock.calls[0][0];
    expect(params.system).toBe(buildAssessmentPrompt("en"));
    expect(params.messages[0].content).toContain("Learner: I am developer");
  });

  it("keeps only runs of the learner's whole words, at least three, and at most three lines", async () => {
    const { assessor } = assessorReturning({
      stop_reason: "end_turn",
      parsed_output: {
        level: "A2",
        evidence: [
          "i am developer",
          "I have worked on many projects.", // never said
          "upload because", // too short
          "Yesterday", // a fragment
          "...", // nothing
          "am develop", // not whole words
          "I work in app",
          "in the upload, because the file is big",
          "Yesterday I fix one bug",
        ],
      },
    });
    expect((await assessor.assess({ language: "en", turns })).evidence).toEqual([
      "i am developer",
      "I work in app",
      "in the upload, because the file is big",
    ]);
  });

  it("fails as unavailable when the request fails or the answer is cut off", async () => {
    const failing = new AnthropicLevelAssessor(
      { parse: vi.fn().mockRejectedValue(new Error("down")) } as unknown as AnthropicMessages,
      config,
    );
    await expect(failing.assess({ language: "en", turns })).rejects.toBeInstanceOf(TutorUnavailableError);
    const { assessor } = assessorReturning({ stop_reason: "max_tokens", parsed_output: null });
    await expect(assessor.assess({ language: "en", turns })).rejects.toBeInstanceOf(TutorUnavailableError);
  });
});

describe("level prompts", () => {
  it("labels each turn by speaker", () => {
    expect(buildTranscript(turns.slice(0, 2))).toBe(
      "Interviewer: What do you do?\nLearner: I am developer, I work in app for translate bible.",
    );
  });

  it("asks for the lower level when unsure and for exact quotes", () => {
    const prompt = buildAssessmentPrompt("en");
    expect(prompt).toContain("choose the lower one");
    expect(prompt).toContain("copied exactly");
    for (const level of ["A1", "A2", "B1", "B2", "C1", "C2"]) expect(prompt).toContain(`- ${level}:`);
  });
});

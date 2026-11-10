import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testConfig } from "../../config/testing.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { AnthropicCheckInReader } from "./anthropic-check-in-reader.js";
import { type AnthropicMessages, ClaudeClient } from "./claude-client.js";
import { buildCheckInReadingPrompt } from "./check-in-prompts.js";

const config = testConfig();
const transcript = "My project help volunteers to find um lugar to serve. It work in the Voxa app, in each lugar.";

function readerReturning(response: object) {
  const parse = vi.fn().mockResolvedValue(response);
  return { reader: new AnthropicCheckInReader(new ClaudeClient({ parse } as unknown as AnthropicMessages, config)), parse };
}

beforeEach(() => {
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
});

describe("AnthropicCheckInReader", () => {
  it("counts the mistakes and the other-language words in the transcript", async () => {
    const { reader, parse } = readerReturning({
      stop_reason: "end_turn",
      parsed_output: {
        mistakes: [
          { said: "My project help", correct: "My project helps" },
          { said: "It work", correct: "It works" },
          { said: "to serve", correct: "to serve" }, // not a mistake
        ],
        // Listed twice, said twice; "um lugar" as one item; "casa" was never said.
        otherLanguageWords: ["lugar", "Lugar", "um lugar", "casa"],
      },
    });
    await expect(reader.read({ language: "en", transcript })).resolves.toEqual({ mistakes: 2, otherLanguageWords: 3 });
    const params = parse.mock.calls[0][0];
    expect(params.system).toBe(buildCheckInReadingPrompt("en"));
    expect(params.messages[0].content).toContain(transcript);
  });

  it("fails as unavailable when the request fails or the answer is cut off", async () => {
    const failing = new AnthropicCheckInReader(new ClaudeClient({ parse: vi.fn().mockRejectedValue(new Error("down")) } as unknown as AnthropicMessages, config));
    await expect(failing.read({ language: "en", transcript })).rejects.toBeInstanceOf(TutorUnavailableError);
    const { reader } = readerReturning({ stop_reason: "max_tokens", parsed_output: null });
    await expect(reader.read({ language: "en", transcript })).rejects.toBeInstanceOf(TutorUnavailableError);
  });
});

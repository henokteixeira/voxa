import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { type TutorRequest, TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { type AnthropicMessages, AnthropicTutorAdapter } from "./anthropic-tutor.adapter.js";
import { OPENING_REQUEST } from "./tutor-prompts.js";

const config = (values: Record<string, string> = {}) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;

function fakeMessages(response: object) {
  const create = vi.fn().mockResolvedValue(response);
  const parse = vi.fn().mockResolvedValue(response);
  return { messages: { create, parse } as unknown as AnthropicMessages, create, parse };
}

const verdict = { reply: "Nice.", issues: [], pendingResolved: false, nextHint: null, correctUses: [], newWords: [], support: null };
const request: TutorRequest = {
  mode: "daily",
  language: "en",
  learnerContext: "",
  history: [{ role: "assistant", content: "Morning! What did you do yesterday?" }],
  pending: null,
  knownMistakes: [],
  utterance: "I fixed the upload.",
};

describe("AnthropicTutorAdapter.open", () => {
  it("returns the opening line with the configured model and a cached system prompt", async () => {
    const { messages, create } = fakeMessages({
      stop_reason: "end_turn",
      content: [{ type: "text", text: " Morning! " }],
    });
    const adapter = new AnthropicTutorAdapter(messages, config({ ANTHROPIC_MODEL: "claude-test" }));

    await expect(adapter.open({ mode: "daily", language: "en", learnerContext: "" })).resolves.toBe("Morning!");

    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-test");
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.messages).toEqual([{ role: "user", content: OPENING_REQUEST }]);
  });

  it("fails on an empty opening line", async () => {
    const { messages } = fakeMessages({ stop_reason: "end_turn", content: [] });
    const adapter = new AnthropicTutorAdapter(messages, config());
    await expect(adapter.open(request)).rejects.toBeInstanceOf(TutorUnavailableError);
  });
});

describe("AnthropicTutorAdapter.evaluate", () => {
  it("sends the history after the opening request, then the turn, and returns the parsed verdict", async () => {
    const { messages, parse } = fakeMessages({ stop_reason: "end_turn", parsed_output: verdict });
    const adapter = new AnthropicTutorAdapter(messages, config({ ANTHROPIC_EFFORT: "medium" }));

    await expect(adapter.evaluate(request)).resolves.toEqual(verdict);

    const params = parse.mock.calls[0][0];
    expect(params.output_config.effort).toBe("medium");
    expect(params.output_config.format).toBeDefined();
    expect(params.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(params.messages[2].content[0].text).toContain("I fixed the upload.");
    expect(params.messages[2].content[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it.each([
    ["the answer does not match the schema", { stop_reason: "end_turn", parsed_output: null }],
    ["the model refuses", { stop_reason: "refusal", parsed_output: null }],
    ["the answer is cut off", { stop_reason: "max_tokens", parsed_output: null }],
    ["the context window is full", { stop_reason: "model_context_window_exceeded", parsed_output: null }],
  ])("fails when %s", async (_, response) => {
    const { messages } = fakeMessages(response);
    const adapter = new AnthropicTutorAdapter(messages, config());
    await expect(adapter.evaluate(request)).rejects.toBeInstanceOf(TutorUnavailableError);
  });

  it("wraps API errors", async () => {
    const parse = vi.fn().mockRejectedValue(new Error("529 overloaded"));
    const adapter = new AnthropicTutorAdapter({ create: vi.fn(), parse } as unknown as AnthropicMessages, config());
    await expect(adapter.evaluate(request)).rejects.toThrow(/529 overloaded/);
  });
});

describe("AnthropicTutorAdapter.open when the context window is full", () => {
  it("fails instead of returning a partial line", async () => {
    const { messages } = fakeMessages({
      stop_reason: "model_context_window_exceeded",
      content: [{ type: "text", text: "Morn" }],
    });
    const adapter = new AnthropicTutorAdapter(messages, config());
    await expect(adapter.open(request)).rejects.toBeInstanceOf(TutorUnavailableError);
  });

  it("tells the tutor the learner's first language (pt-BR unless configured)", async () => {
    const { messages, parse } = fakeMessages({ stop_reason: "end_turn", parsed_output: verdict });
    await new AnthropicTutorAdapter(messages, config()).evaluate(request);
    await new AnthropicTutorAdapter(messages, config({ LEARNER_FIRST_LANGUAGE: "es" })).evaluate(request);
    expect(parse.mock.calls[0][0].system[0].text).toContain("The learner's first language is pt-BR");
    expect(parse.mock.calls[1][0].system[0].text).toContain("The learner's first language is es");
  });
});

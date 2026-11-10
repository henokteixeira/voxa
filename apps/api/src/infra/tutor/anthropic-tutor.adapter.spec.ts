import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { testConfig } from "../../config/testing.js";
import { type TutorRequest, TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { AnthropicTutorAdapter, leadingReply } from "./anthropic-tutor.adapter.js";
import { type AnthropicMessages, ClaudeClient } from "./claude-client.js";
import { OPENING_REQUEST } from "./tutor-prompts.js";

const config = testConfig;

/** A stream that writes the answer's JSON in small pieces, then resolves to the final message. */
function fakeStream(response: { parsed_output?: unknown } & object, failure?: Error) {
  const listeners: ((delta: string, snapshot: string) => void)[] = [];
  const stream = {
    on(event: string, listener: (delta: string, snapshot: string) => void) {
      if (event === "text") listeners.push(listener);
      return stream;
    },
    async finalMessage() {
      if (failure) throw failure;
      const json = response.parsed_output ? JSON.stringify(response.parsed_output) : "";
      let snapshot = "";
      for (let i = 0; i < json.length; i += 7) {
        const delta = json.slice(i, i + 7);
        snapshot += delta;
        for (const listener of listeners) listener(delta, snapshot);
      }
      return response;
    },
  };
  return stream;
}

function fakeMessages(response: object) {
  const create = vi.fn().mockResolvedValue(response);
  const parse = vi.fn().mockResolvedValue(response);
  const stream = vi.fn((_params: any, _options?: any) => fakeStream(response));
  return { messages: { create, parse, stream } as unknown as AnthropicMessages, create, parse, stream };
}

const verdict = { reply: "Nice.", issues: [], pendingResolved: false, nextHint: null, correctUses: [], usedExpressions: [], newWords: [], support: null, coveredGoals: [], stuck: false, scaffold: null };
const request: TutorRequest = {
  mode: "daily",
  language: "en",
  learnerContext: "",
  history: [{ role: "assistant", content: "Morning! What did you do yesterday?" }],
  pending: null,
  knownMistakes: [],
  knownNewWords: [],
  knownPatterns: [],
  focusPatterns: [],
  reviewExpressions: [],
  bringBack: [],
  utterance: "I fixed the upload.",
  goals: [],
  targets: [],
  coveredGoals: [],
  step: "conversation",
  scaffold: null,
  plan: null,
};

describe("AnthropicTutorAdapter.open", () => {
  it("asks for the opening line as structured output, so it never comes back as raw JSON text", async () => {
    const { messages, parse } = fakeMessages({ stop_reason: "end_turn", parsed_output: { reply: " Morning! ", scaffold: null } });
    const adapter = new AnthropicTutorAdapter(new ClaudeClient(messages, config({ ANTHROPIC_MODEL: "claude-test" })), config({ ANTHROPIC_MODEL: "claude-test" }));

    await expect(adapter.open({ mode: "daily", language: "en", learnerContext: "", goals: [], targets: [], step: null })).resolves.toEqual({
      line: "Morning!",
      scaffold: null,
    });

    const params = parse.mock.calls[0][0];
    expect(params.model).toBe("claude-test");
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format).toBeDefined();
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.messages).toEqual([{ role: "user", content: OPENING_REQUEST }]);
  });

  it("sends the guided track's first step with the opening and returns its model sentence", async () => {
    const { messages, parse } = fakeMessages({
      stop_reason: "end_turn",
      parsed_output: { reply: "Hi! Repeat after me: Yesterday I worked on the login screen.", scaffold: " Yesterday I worked on the login screen. " },
    });
    const adapter = new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config());
    const step = { stage: "model" as const, retry: false, goal: null };
    const opening = await adapter.open({ ...request, step: "build_full" }, { otherwise: step, ifStuck: step, hintsPause: false });
    expect(opening.scaffold).toBe("Yesterday I worked on the login screen.");
    expect(parse.mock.calls[0][0].messages[0].content).toMatch(/^Start the scene[\s\S]*<guided_track>\nSay one short model sentence/);
  });

  it("fails on an empty opening line", async () => {
    const { messages } = fakeMessages({ stop_reason: "end_turn", parsed_output: { reply: "  ", scaffold: null } });
    const adapter = new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config());
    await expect(adapter.open(request)).rejects.toBeInstanceOf(TutorUnavailableError);
  });

  it("fails when the opening line does not match the schema", async () => {
    const { messages } = fakeMessages({ stop_reason: "end_turn", parsed_output: null });
    const adapter = new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config());
    await expect(adapter.open(request)).rejects.toBeInstanceOf(TutorUnavailableError);
  });
});

describe("AnthropicTutorAdapter.evaluate", () => {
  it("hands over the spoken line once, as soon as it is written, before the answer is complete", async () => {
    const answer = { ...verdict, reply: 'Nice. "Ship it" today?' };
    const { messages } = fakeMessages({ stop_reason: "end_turn", parsed_output: answer });
    let settled = false;
    const handed: { reply: string; settled: boolean }[] = [];

    const result = await new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config())
      .evaluate(request, (reply) => handed.push({ reply, settled }))
      .finally(() => {
        settled = true;
      });

    expect(result).toEqual(answer);
    expect(handed).toEqual([{ reply: 'Nice. "Ship it" today?', settled: false }]);
  });

  it("limits the whole stream, not only the wait for its first byte", async () => {
    const { messages, stream } = fakeMessages({ stop_reason: "end_turn", parsed_output: verdict });
    await new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config()).evaluate(request);
    expect(stream.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("still fails when the answer is refused after the line was written", async () => {
    const { messages } = fakeMessages({ stop_reason: "refusal", parsed_output: verdict });
    const onReply = vi.fn();
    await expect(new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config()).evaluate(request, onReply)).rejects.toBeInstanceOf(TutorUnavailableError);
    expect(onReply).toHaveBeenCalledWith("Nice.");
  });

  it("sends the history after the opening request, then the turn, and returns the parsed verdict", async () => {
    const { messages, stream } = fakeMessages({ stop_reason: "end_turn", parsed_output: verdict });
    const adapter = new AnthropicTutorAdapter(new ClaudeClient(messages, config({ ANTHROPIC_EFFORT: "medium" })), config({ ANTHROPIC_EFFORT: "medium" }));

    await expect(adapter.evaluate(request)).resolves.toEqual(verdict);

    const params = stream.mock.calls[0][0];
    expect(params.output_config.effort).toBe("medium");
    expect(params.output_config.format).toBeDefined();
    expect(params.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(params.messages[2].content[0].text).toContain("I fixed the upload.");
  });

  it("caches the conversation up to the last saved turn, so the next turn reads it from the cache", async () => {
    const { messages, stream } = fakeMessages({ stop_reason: "end_turn", parsed_output: verdict });
    const adapter = new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config());
    const history = [
      { role: "assistant" as const, content: "Morning! What did you do yesterday?" },
      { role: "user" as const, content: "I fixed the upload." },
      { role: "assistant" as const, content: "Nice. What's next?" },
    ];

    await adapter.evaluate({ ...request, history, utterance: "I will test it." });

    const sent = stream.mock.calls[0][0].messages;
    // The breakpoint sits on the last history turn: those turns are sent the same way next time.
    expect(sent[3]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Nice. What's next?", cache_control: { type: "ephemeral" } }],
    });
    expect(sent[1]).toEqual({ role: "assistant", content: "Morning! What did you do yesterday?" });
    // The turn message carries this turn's lists and is never sent again, so caching it would be wasted.
    expect(sent[4].content[0].cache_control).toBeUndefined();
  });

  it.each([
    ["the answer does not match the schema", { stop_reason: "end_turn", parsed_output: null }],
    ["the model refuses", { stop_reason: "refusal", parsed_output: null }],
    ["the answer is cut off", { stop_reason: "max_tokens", parsed_output: null }],
    ["the context window is full", { stop_reason: "model_context_window_exceeded", parsed_output: null }],
  ])("fails when %s", async (_, response) => {
    const { messages } = fakeMessages(response);
    const adapter = new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config());
    await expect(adapter.evaluate(request)).rejects.toBeInstanceOf(TutorUnavailableError);
  });

  it("wraps API errors", async () => {
    const stream = vi.fn((_params: any) => fakeStream({}, new Error("529 overloaded")));
    const adapter = new AnthropicTutorAdapter(new ClaudeClient({ create: vi.fn(), parse: vi.fn(), stream } as unknown as AnthropicMessages, config()), config());
    await expect(adapter.evaluate(request)).rejects.toThrow(/529 overloaded/);
  });
});

describe("AnthropicTutorAdapter.open when the context window is full", () => {
  it("fails instead of returning a partial line", async () => {
    const { messages } = fakeMessages({
      stop_reason: "model_context_window_exceeded",
      content: [{ type: "text", text: "Morn" }],
    });
    const adapter = new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config());
    await expect(adapter.open(request)).rejects.toBeInstanceOf(TutorUnavailableError);
  });

  it("tells the tutor the learner's first language (pt-BR unless configured)", async () => {
    const { messages, stream: parse } = fakeMessages({ stop_reason: "end_turn", parsed_output: verdict });
    await new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config()).evaluate(request);
    await new AnthropicTutorAdapter(new ClaudeClient(messages, config({ LEARNER_FIRST_LANGUAGE: "es" })), config({ LEARNER_FIRST_LANGUAGE: "es" })).evaluate(request);
    expect(parse.mock.calls[0][0].system[0].text).toContain("The learner's first language is pt-BR");
    expect(parse.mock.calls[1][0].system[0].text).toContain("The learner's first language is es");
  });
});

describe("AnthropicTutorAdapter usage log", () => {
  it("logs the tokens each call used, so the cost per turn can be measured", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const usage = { input_tokens: 120, cache_read_input_tokens: 3000, cache_creation_input_tokens: 400, output_tokens: 250 };
    const { messages } = fakeMessages({ stop_reason: "end_turn", parsed_output: verdict, usage });
    const adapter = new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config());

    await adapter.evaluate(request);

    expect(log).toHaveBeenCalledWith("tutor usage call=tutor_turn input=120 cache_read=3000 cache_write=400 output=250");
    log.mockRestore();
  });

  it("logs nothing when the response has no usage", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const { messages } = fakeMessages({ stop_reason: "end_turn", parsed_output: verdict });

    await new AnthropicTutorAdapter(new ClaudeClient(messages, config()), config()).evaluate(request);

    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("leadingReply", () => {
  it.each([
    ['{"reply":"Nice', null],
    ['{"reply":"Say \\"hi', null],
    ['{"reply":"Nice."', "Nice."],
    ['{ "reply" : "Say \\"hi\\" to \\u00e9quipe.\\n" , "issues":[', 'Say "hi" to équipe.'],
    ['{"issues":[],"reply":"Nice."', null],
    ['{"reply":"  "', null],
  ])("%s → %s", (partial, expected) => {
    expect(leadingReply(partial)).toBe(expected);
  });
});

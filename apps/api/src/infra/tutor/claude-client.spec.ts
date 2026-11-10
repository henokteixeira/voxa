import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { testConfig } from "../../config/testing.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { type AnthropicMessages, ClaudeClient } from "./claude-client.js";

const Schema = z.object({ ok: z.boolean() });

function client(response: object, values: Record<string, string> = {}) {
  const parse = vi.fn().mockResolvedValue(response);
  return { claude: new ClaudeClient({ parse } as unknown as AnthropicMessages, testConfig(values)), parse };
}

const ask = (claude: ClaudeClient) =>
  claude.parse("review_check", { schema: Schema, system: "Check.", maxTokens: 100, messages: [{ role: "user", content: "Hi" }] });

describe("ClaudeClient", () => {
  it("runs every task on ANTHROPIC_MODEL, with ANTHROPIC_EFFORT except the ones that need more or less thought", () => {
    const { claude } = client({}, { ANTHROPIC_MODEL: "claude-opus-5-5", ANTHROPIC_EFFORT: "low" });
    expect(claude.settings("tutor_turn")).toEqual({ model: "claude-opus-5-5", effort: "low" });
    expect(claude.settings("assess")).toEqual({ model: "claude-opus-5-5", effort: "medium" });
    expect(claude.settings("memory")).toEqual({ model: "claude-opus-5-5", effort: "low" });
  });

  it("gives a task its own model or effort from ANTHROPIC_TASKS, and sends them", async () => {
    const { claude, parse } = client(
      { stop_reason: "end_turn", parsed_output: { ok: true } },
      { ANTHROPIC_TASKS: "review_check=claude-haiku-5-5@medium, memory=@high" },
    );
    expect(claude.settings("memory")).toEqual({ model: "claude-opus-5-5", effort: "high" });

    expect(await ask(claude)).toEqual({ ok: true });
    expect(parse.mock.calls[0][0]).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 100, output_config: { effort: "medium" } });
  });

  it("refuses an unknown task or effort in ANTHROPIC_TASKS at startup", () => {
    expect(() => testConfig({ ANTHROPIC_TASKS: "reviews=claude-haiku-5-5" })).toThrow(/reviews=claude-haiku-5-5/);
    expect(() => testConfig({ ANTHROPIC_TASKS: "memory=@max" })).toThrow(/memory=@max/);
  });

  it("fails as unavailable on a network error, a refusal, a cut-off answer or one off the schema", async () => {
    const down = new ClaudeClient({ parse: vi.fn().mockRejectedValue(new Error("529")) } as unknown as AnthropicMessages, testConfig());
    await expect(ask(down)).rejects.toThrow(/529/);
    for (const response of [
      { stop_reason: "refusal", parsed_output: null },
      { stop_reason: "max_tokens", parsed_output: null },
      { stop_reason: "end_turn", parsed_output: null },
    ]) {
      await expect(ask(client(response).claude)).rejects.toBeInstanceOf(TutorUnavailableError);
    }
  });

  it("records every call with its task, model, effort, tokens and time, and whether it failed", async () => {
    const modelCall = vi.fn().mockResolvedValue(undefined);
    const usage = { input_tokens: 10, cache_read_input_tokens: 200, cache_creation_input_tokens: 30, output_tokens: 40 };
    const parse = vi
      .fn()
      .mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: { ok: true }, usage })
      .mockResolvedValueOnce({ stop_reason: "max_tokens", parsed_output: null, usage })
      .mockRejectedValueOnce(new Error("down"));
    const claude = new ClaudeClient({ parse } as unknown as AnthropicMessages, testConfig({ ANTHROPIC_MODEL: "claude-x" }), { voiceTurn: vi.fn(), modelCall });

    await ask(claude);
    await ask(claude).catch(() => {});
    await ask(claude).catch(() => {});

    expect(modelCall.mock.calls.map(([call]) => call)).toEqual([
      { task: "review_check", model: "claude-x", effort: "low", inputTokens: 10, cacheReadTokens: 200, cacheWriteTokens: 30, outputTokens: 40, durationMs: expect.any(Number), failed: false },
      expect.objectContaining({ failed: true, outputTokens: 40 }),
      expect.objectContaining({ failed: true, inputTokens: 0, outputTokens: 0 }),
    ]);
  });
});

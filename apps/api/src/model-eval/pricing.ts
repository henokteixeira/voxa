import type Anthropic from "@anthropic-ai/sdk";

/** US dollars per million tokens. */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  /** 5-minute cache writes (1.25x input). */
  cacheWrite: number;
}

/**
 * Anthropic list prices (first-party API, checked 2026-11). Haiku 5.5 is the rate for prompts up to 100K tokens,
 * which covers every tutor turn. Update when prices change.
 */
export const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export type Usage = Pick<
  Anthropic.Usage,
  "input_tokens" | "output_tokens" | "cache_read_input_tokens" | "cache_creation_input_tokens"
>;

/** What one call cost in dollars, or null when the model has no price in the table. */
export function costOf(model: string, usage: Usage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite) /
    1_000_000
  );
}

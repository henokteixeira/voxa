import type { TutorVerdict } from "../domain/conversation/correction-policy.js";
import type { TutorPort, TutorRequest } from "../domain/ports/tutor.port.js";
import type { AnthropicMessages } from "../infra/tutor/claude-client.js";
import type { Usage } from "./pricing.js";

export type CallKind = "open" | "evaluate";

/**
 * The SDK messages with a hook on each finished call, so the eval can add up tokens without touching the adapter.
 * The adapter opens with `parse` and evaluates turns with `stream`.
 */
export function meteredMessages(inner: AnthropicMessages, onUsage: (kind: CallKind, usage: Usage) => void): AnthropicMessages {
  return {
    create: inner.create.bind(inner),
    parse: ((...args: Parameters<AnthropicMessages["parse"]>) => {
      const promise = inner.parse(...args);
      void promise.then((response) => onUsage("open", response.usage)).catch(() => undefined);
      return promise;
    }) as AnthropicMessages["parse"],
    stream: ((...args: Parameters<AnthropicMessages["stream"]>) => {
      const stream = inner.stream(...args);
      stream.on("finalMessage", (message) => onUsage("evaluate", message.usage));
      return stream;
    }) as AnthropicMessages["stream"],
  };
}

export interface TurnTiming {
  /** Until the spoken reply was ready: what the learner waits for. Null when it never came early. */
  replyMs: number | null;
  /** Until the whole reading (mistakes, hints) was done. */
  totalMs: number;
}

/** A tutor that times each turn. */
export function timedTutor(inner: TutorPort, onTiming: (timing: TurnTiming) => void, now = () => performance.now()): TutorPort {
  return {
    open: (context, plan) => inner.open(context, plan),
    help: (context, history) => inner.help(context, history),
    async evaluate(request: TutorRequest, onReply?: (reply: string) => void): Promise<TutorVerdict> {
      const start = now();
      let replyMs: number | null = null;
      const verdict = await inner.evaluate(request, (reply) => {
        replyMs = now() - start;
        onReply?.(reply);
      });
      onTiming({ replyMs, totalMs: now() - start });
      return verdict;
    },
  };
}

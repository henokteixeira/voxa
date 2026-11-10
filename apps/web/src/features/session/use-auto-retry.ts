import { type RefObject, useEffect, useRef, useState } from "react";
import type { FailureCode, SessionState } from "./session-state";

/** Failures that often pass on their own (a slow or restarting server): retried by themselves first. */
const AUTO_RETRY_FAILURES: FailureCode[] = ["voice_unavailable", "tutor_unavailable", "server", "disconnected"];
/** The waits before each automatic retry; after the last one the learner decides. */
export const AUTO_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];

/** An automatic retry is on its way: the attempt number, out of how many. */
export interface AutoRetry {
  attempt: number;
  of: number;
}

/**
 * A failure that may pass on its own is retried by itself, waiting longer each time, with the same turn.
 * `spent` counts the automatic retries spent on the current turn; the caller sets it back to 0 once the
 * server answers the turn, or when the learner retries by hand.
 */
export function useAutoRetry(state: SessionState, retry: () => void, spent: RefObject<number>): AutoRetry | null {
  const [autoRetry, setAutoRetry] = useState<AutoRetry | null>(null);
  const retryLater = useRef(retry);
  useEffect(() => {
    retryLater.current = retry;
  }, [retry]);
  const canAutoRetry =
    state.phase === "failed" && state.failure !== null && AUTO_RETRY_FAILURES.includes(state.failure) && state.sessionId !== null;
  useEffect(() => {
    if (!canAutoRetry) return;
    const attempt = spent.current;
    if (attempt >= AUTO_RETRY_DELAYS_MS.length) return;
    setAutoRetry({ attempt: attempt + 1, of: AUTO_RETRY_DELAYS_MS.length });
    const timer = setTimeout(() => {
      spent.current = attempt + 1;
      retryLater.current();
    }, AUTO_RETRY_DELAYS_MS[attempt]);
    return () => {
      clearTimeout(timer);
      setAutoRetry(null);
    };
  }, [canAutoRetry, state.retry, spent]);
  return autoRetry;
}

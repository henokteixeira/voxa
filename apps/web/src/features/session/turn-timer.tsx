import { useEffect, useState } from "react";
import { useCopy } from "@/lib/i18n/locale";
import { DEFAULT_TURN_OPTIONS } from "@/lib/voice/turn-detector";
import { SESSION_COPY } from "./session-copy";

/** The longest turn: the microphone sends what it heard so far when it is reached. */
const MAX_TURN_MS = DEFAULT_TURN_OPTIONS.maxTurnMs;
/** From here a calm note says what happens at the limit; before it, only the time shows. */
const TURN_NOTE_AT_MS = MAX_TURN_MS - 15_000;

const clockText = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * How long the learner has been talking, out of the longest turn. Mounted when they start talking, so
 * its clock starts there. Information, never a countdown: speaking long is fine, the turn just goes out.
 */
export function TurnTimer() {
  const { page } = useCopy(SESSION_COPY);
  const [startedAt] = useState(() => performance.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsedMs(Math.min(MAX_TURN_MS, performance.now() - startedAt)), 250);
    return () => clearInterval(timer);
  }, [startedAt]);
  return (
    <>
      <span role="timer" className="text-caption text-taupe tabular-nums">
        {page.turnTime(clockText(elapsedMs), clockText(MAX_TURN_MS))}
      </span>
      {elapsedMs >= TURN_NOTE_AT_MS && (
        <span aria-live="polite" className="text-caption text-taupe">
          {page.turnLimit(clockText(MAX_TURN_MS))}
        </span>
      )}
    </>
  );
}

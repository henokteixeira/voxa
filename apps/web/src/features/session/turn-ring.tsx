import { useEffect, useState } from "react";
import { BallRing } from "@/components/ball-ring";
import { useCopy } from "@/lib/i18n/locale";
import { DEFAULT_TURN_OPTIONS } from "@/lib/voice/turn-detector";
import { SESSION_COPY } from "./session-copy";

/** The longest turn: the microphone sends what it heard so far when it is reached. */
const MAX_TURN_MS = DEFAULT_TURN_OPTIONS.maxTurnMs;
/** The ring shows only in the last stretch of the turn; before it nothing on screen counts time. */
const RING_FROM_MS = MAX_TURN_MS - 15_000;

const clockText = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * A thin ring around the ball that appears in the last 15 s of a turn and closes as the turn reaches its
 * limit. No numbers: it is a gentle sign, never a countdown. Mounted when the learner starts talking, so
 * its clock starts there. Screen readers get one calm note when it appears.
 */
export function TurnRing({ ballSize }: { ballSize: number }) {
  const { page } = useCopy(SESSION_COPY);
  const [startedAt] = useState(() => performance.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsedMs(Math.min(MAX_TURN_MS, performance.now() - startedAt)), 250);
    return () => clearInterval(timer);
  }, [startedAt]);

  const shown = elapsedMs >= RING_FROM_MS;
  const progress = shown ? (elapsedMs - RING_FROM_MS) / (MAX_TURN_MS - RING_FROM_MS) : 0;

  return (
    <>
      <BallRing
        ballSize={ballSize}
        filled={progress}
        data-testid="turn-ring"
        data-shown={shown}
        visible={shown}
      />
      <span aria-live="polite" className="sr-only">
        {shown ? page.turnLimit(clockText(MAX_TURN_MS)) : ""}
      </span>
    </>
  );
}

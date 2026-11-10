import { useEffect, useState } from "react";

/** Counts the seconds the session runs (not while paused); a resumed session starts from its saved count. */
export function useElapsedSeconds(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return [seconds, setSeconds] as const;
}

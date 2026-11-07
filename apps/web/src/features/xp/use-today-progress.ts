import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/hooks/use-api";
import type { TodayProgress } from "@/lib/api";

/** Today's XP, goal and streak. `today` is undefined while loading and null when it could not be read. */
export function useTodayProgress() {
  const api = useApi();
  const [today, setToday] = useState<TodayProgress | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .todayProgress()
      .then((t) => !cancelled && setToday(t))
      .catch((error: unknown) => {
        // The screens go on without it; the warning keeps the cause visible.
        console.warn("Could not load today's progress.", error);
        if (!cancelled) setToday(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  /** Takes a fresh copy the server already sent (e.g. after saving the practice time). */
  const set = useCallback((next: TodayProgress) => setToday(next), []);
  return { today, reload, set };
}

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/hooks/use-api";
import type { CefrLevel, LevelView } from "@/lib/api";

/**
 * The learner's speaking level. `view` is undefined while loading and null when it could not be read
 * (screens then go on as if there were no level). `set` corrects it by hand.
 */
export function useLevel() {
  const api = useApi();
  const [view, setView] = useState<LevelView | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .level()
      .then((v) => !cancelled && setView(v))
      .catch(() => !cancelled && setView(null));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const set = useCallback(
    async (level: CefrLevel) => {
      setView(await api.setLevel(level));
    },
    [api],
  );

  return { view, set };
}

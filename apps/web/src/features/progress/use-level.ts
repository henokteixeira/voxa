import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/hooks/use-api";
import type { CefrLevel, LevelView, StepChangeProposal } from "@/lib/api";

/** One step-change proposal: "Not yet" hides it, and after another session that still points the same way, it comes back. */
export const proposalKey = (proposal: StepChangeProposal) => `${proposal.basedOn}:${proposal.direction}:${proposal.to}`;

/**
 * The learner's speaking level. `view` is undefined while loading and null when it could not be read
 * (Today then goes on as if there were a level; Progress offers `reload`). `set` corrects it by hand;
 * `confirm` accepts the proposed step change.
 */
export function useLevel() {
  const api = useApi();
  const [view, setView] = useState<LevelView | null | undefined>(undefined);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .level()
      .then((v) => !cancelled && setView(v))
      .catch(() => !cancelled && setView(null));
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const reload = useCallback(() => {
    setView(undefined);
    setAttempt((n) => n + 1);
  }, []);

  const set = useCallback(
    async (level: CefrLevel) => {
      setView(await api.setLevel(level));
    },
    [api],
  );

  const confirm = useCallback(
    async (to: CefrLevel) => {
      setView(await api.confirmStepChange(to));
    },
    [api],
  );

  return { view, set, confirm, reload };
}

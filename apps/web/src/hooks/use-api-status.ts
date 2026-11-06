import { useEffect, useState } from "react";
import { useApi } from "./use-api";

export type ApiStatus = "checking" | "ok" | "down";

/** Checks once whether the API answers. `retry` checks again. */
export function useApiStatus(): { status: ApiStatus; retry: () => void } {
  const api = useApi();
  const [status, setStatus] = useState<ApiStatus>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .health()
      .then(() => active && setStatus("ok"))
      .catch(() => active && setStatus("down"));
    return () => {
      active = false;
    };
  }, [api, attempt]);

  return {
    status,
    retry: () => {
      setStatus("checking");
      setAttempt((n) => n + 1);
    },
  };
}

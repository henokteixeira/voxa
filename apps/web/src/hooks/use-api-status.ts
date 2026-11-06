import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useApi } from "./use-api";

/** `unreachable`: nothing answers (API not started). `error`: the API answered with a failure. */
export type ApiStatus = "checking" | "ok" | "unreachable" | "error";

/** Checks whether the API answers, again on `retry` and when the connection comes back. */
export function useApiStatus(): { status: ApiStatus; retry: () => void } {
  const api = useApi();
  const [status, setStatus] = useState<ApiStatus>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .health()
      .then(() => active && setStatus("ok"))
      .catch((error: unknown) => {
        if (!active) return;
        setStatus(error instanceof ApiError && error.kind === "offline" ? "unreachable" : "error");
      });
    return () => {
      active = false;
    };
  }, [api, attempt]);

  useEffect(() => {
    const onOnline = () => setAttempt((n) => n + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return {
    status,
    retry: () => {
      setStatus("checking");
      setAttempt((n) => n + 1);
    },
  };
}

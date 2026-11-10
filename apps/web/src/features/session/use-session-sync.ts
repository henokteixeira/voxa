import { type RefObject, useEffect } from "react";
import type { ApiClient, Mode } from "@/lib/api";
import type { FluencyClock } from "./fluency-clock";
import { saveSession } from "./saved-session";
import type { SessionState } from "./session-state";

/** How often an open session saves its timing on the server, besides after each turn. */
const TIMING_HEARTBEAT_MS = 5 * 60 * 1000;

interface SessionSyncDeps {
  api: ApiClient;
  state: SessionState;
  mode: Mode;
  missionId: string | null;
  seconds: number;
  clock: RefObject<FluencyClock>;
  /** True once the learner ended the session here. */
  ended: RefObject<boolean>;
}

/** Keeps an open session where a reload (this browser) and the idle-session check (the server) can see it. */
export function useSessionSync({ api, state, mode, missionId, seconds, clock, ended }: SessionSyncDeps): void {
  // Keeps what the server does not, so a reload can pick the session up again.
  useEffect(() => {
    const id = state.sessionId;
    if (!id || ended.current || state.phase === "ending" || state.phase === "ended") return;
    saveSession({ sessionId: id, mode, missionId, elapsedSeconds: seconds, timing: clock.current.timing() });
  }, [state.sessionId, state.phase, mode, missionId, seconds, clock, ended]);

  // While the session is open here (paused too), the server hears from it at least this often, so it never
  // closes a session this tab can still go on with.
  const openId = state.phase === "ending" || state.phase === "ended" ? null : state.sessionId;
  useEffect(() => {
    if (!openId) return;
    const timer = setInterval(() => {
      if (!ended.current) void api.saveTiming(openId, clock.current.timing()).catch(() => {});
    }, TIMING_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [api, openId, clock, ended]);
}

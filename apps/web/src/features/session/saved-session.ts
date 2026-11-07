import { MODES, type Mode, type SessionTiming } from "@/lib/api";

/**
 * The live session, kept in the browser so a reload can pick it up again.
 * Only what the server does not keep: the time on the clock and the fluency timing.
 */
export interface SavedSession {
  sessionId: string;
  mode: Mode;
  elapsedSeconds: number;
  timing: SessionTiming;
}

const KEY = "voxa.liveSession";

const isMs = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;

function isTiming(value: unknown): value is SessionTiming {
  const t = value as Partial<SessionTiming> | null;
  return !!t && isMs(t.learnerSpeechMs) && isMs(t.tutorSpeechMs) && Array.isArray(t.pausesMs) && t.pausesMs.every(isMs);
}

export function loadSavedSession(): SavedSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<SavedSession> | null;
    if (!value || typeof value.sessionId !== "string" || !MODES.includes(value.mode as Mode)) return null;
    return {
      sessionId: value.sessionId,
      mode: value.mode as Mode,
      elapsedSeconds: Number.isFinite(value.elapsedSeconds) ? Number(value.elapsedSeconds) : 0,
      timing: isTiming(value.timing) ? value.timing : { learnerSpeechMs: 0, tutorSpeechMs: 0, pausesMs: [] },
    };
  } catch {
    return null;
  }
}

/** Best effort: without storage, a reload just starts a new session. */
export function saveSession(session: SavedSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage blocked or full.
  }
}

export function clearSavedSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage blocked.
  }
}

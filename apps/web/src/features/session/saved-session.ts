import { ApiError, type ApiClient, type ApiErrorKind, MODES, type Mode, type SessionTiming } from "@/lib/api";

/**
 * The live session, kept in the browser so a reload can pick it up again.
 * Only what the server does not keep: the time on the clock and the fluency timing.
 */
export interface SavedSession {
  sessionId: string;
  mode: Mode;
  elapsedSeconds: number;
  timing: SessionTiming;
  /** When it was last saved (ms since epoch): the last moment the session was running. */
  savedAt: number;
}

/** How long a session left mid-way can be picked up again (confirmed by the learner on 2026-11-07). */
export const RESUME_LIMIT_MS = 2 * 60 * 60 * 1000;

export function isExpired(saved: SavedSession, now = Date.now()): boolean {
  return now - saved.savedAt > RESUME_LIMIT_MS;
}

/** API errors that may pass: the saved session is kept for later. */
export const TRANSIENT_ERRORS: ApiErrorKind[] = ["offline", "server", "tutor_unavailable"];

const KEY = "voxa.liveSession";

const isMs = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;

const isMsList = (list: unknown): list is number[] => Array.isArray(list) && list.every(isMs);

const EMPTY_TIMING: SessionTiming = { learnerSpeechMs: 0, tutorSpeechMs: 0, pausesMs: [], longPausesMs: [], spokenWords: 0 };

/** A saved timing. One saved before the long pauses and words were measured keeps them missing: it has no pace. */
function readTiming(value: unknown): SessionTiming {
  const t = value as Partial<SessionTiming> | null;
  if (!t || !isMs(t.learnerSpeechMs) || !isMs(t.tutorSpeechMs) || !isMsList(t.pausesMs)) return EMPTY_TIMING;
  const measuredPace = isMsList(t.longPausesMs) && isMs(t.spokenWords);
  return {
    learnerSpeechMs: t.learnerSpeechMs as number,
    tutorSpeechMs: t.tutorSpeechMs as number,
    pausesMs: t.pausesMs,
    ...(measuredPace && { longPausesMs: t.longPausesMs, spokenWords: t.spokenWords }),
  };
}

export function loadSavedSession(): SavedSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<SavedSession> | null;
    if (!value || typeof value.sessionId !== "string" || !MODES.includes(value.mode as Mode)) return null;
    return {
      sessionId: value.sessionId,
      mode: value.mode as Mode,
      elapsedSeconds: Number.isFinite(value.elapsedSeconds) ? Number(value.elapsedSeconds) : 0,
      timing: readTiming(value.timing),
      // Unknown age: too old to pick up.
      savedAt: Number.isFinite(value.savedAt) ? Number(value.savedAt) : 0,
    };
  } catch {
    return null;
  }
}

/** Best effort: without storage, a reload just starts a new session. */
export function saveSession(session: Omit<SavedSession, "savedAt">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
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

/**
 * The saved session, if it can still be picked up. One left for more than RESUME_LIMIT_MS is ended on the
 * server with its timing, so its summary is kept, and forgotten here.
 */
export function takeSavedSession(api: Pick<ApiClient, "endSession">): SavedSession | null {
  const saved = loadSavedSession();
  if (!saved || !isExpired(saved)) return saved;
  // Forgotten only once the server has it (ending twice is safe): offline, it waits for the next visit.
  void api.endSession(saved.sessionId, saved.timing).then(
    () => clearSavedSession(),
    (error: unknown) => {
      if (!(error instanceof ApiError && TRANSIENT_ERRORS.includes(error.kind))) clearSavedSession();
    },
  );
  return null;
}

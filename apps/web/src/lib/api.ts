/** Typed client for the Voxa API. Every call fails with ApiError, never a raw fetch error. */

export const MODES = ["presentation", "free_talk", "daily", "review"] as const;
export type Mode = (typeof MODES)[number];

export interface StartedSession {
  sessionId: string;
  mode: Mode;
  language: string;
  message: string;
  /** Goals of the meeting, in order; empty in free talk. */
  goals: string[];
}

/** An open session as the server keeps it, to pick it up again after a reload. */
export interface ResumedSession {
  sessionId: string;
  mode: Mode;
  language: string;
  startedAt: string;
  turns: { role: "user" | "assistant"; content: string }[];
  goals: string[];
  coveredGoals: string[];
  /** The pending correction's hint step, without the correction. */
  hint: { hintsGiven: number; revealed: boolean } | null;
}

export interface TurnResult {
  kind: "reply" | "hint" | "reveal";
  message: string;
  selfCorrected: boolean;
  /** Written help in the learner's first language, shown on screen and never spoken. */
  support?: string | null;
  /** The tutor asked whether to stop or keep going. */
  checkIn?: boolean;
  /** Goals of the meeting covered so far. */
  coveredGoals?: string[];
}

/**
 * What the tutor adds after its reply, once it has read the learner's turn: a hint about a serious mistake
 * (spoken right after the reply), the stop-or-keep-going question, or only on-screen help and goals.
 */
export interface FollowUp extends Omit<TurnResult, "message"> {
  /** The spoken line, or null when there is nothing to say. */
  message: string | null;
}

/** The category the API gives a word the learner said in their first language. Not a mistake. */
export const NEW_WORD_CATEGORY = "new_word";

export interface SessionMistake {
  original: string;
  correction: string;
  category: string;
  severity: "serious" | "minor";
  selfCorrected: boolean;
  occurrences: number;
}

/** Timing measured during a live session (see features/session/fluency-clock.ts). */
export interface SessionTiming {
  learnerSpeechMs: number;
  tutorSpeechMs: number;
  pausesMs: number[];
}

/** The 4 fluency signals. Null when the session gave nothing to measure. */
export interface FluencySignals {
  /** 0–1: of the mistakes that got a hint, the share the learner fixed alone. */
  selfCorrectionRate: number | null;
  mistakesPer100Words: number | null;
  averagePauseMs: number | null;
  /** 0–1: the learner's share of the speaking time. */
  speakingShare: number | null;
}

export type ConfidenceMoment = "before" | "after";

export interface SessionSummary {
  sessionId: string;
  mode: Mode;
  mistakes: SessionMistake[];
  selfCorrections: number;
  signals: FluencySignals;
  confidence: { before: number | null; after: number | null };
  goals: { id: string; covered: boolean }[];
  /** Mistakes from the bank practiced in this session; `met` when the learner said the correct form. */
  targets: { original: string; correction: string; category: string; met: boolean }[];
}

export type MistakeStatus = "open" | "improving" | "mastered";

/** A mistake in the bank, as the Mistakes screen shows it. */
export interface BankMistake {
  id: string;
  /** BCP 47 tag, e.g. "en". */
  language: string;
  original: string;
  correction: string;
  category: string;
  occurrences: number;
  /** ISO 8601 date-time. */
  lastSeenAt: string;
  status: MistakeStatus;
}

/** Why the learner says a record is not a mistake. */
export type DismissReason = "transcript_error" | "both_correct" | "not_needed";

/** What went wrong, in terms the screens can act on. */
export type ApiErrorKind = "offline" | "not_found" | "ended" | "tutor_unavailable" | "invalid" | "server";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

function kindFor(status: number): ApiErrorKind {
  if (status === 400) return "invalid";
  if (status === 404) return "not_found";
  if (status === 409) return "ended";
  if (status === 502 || status === 503) return "tutor_unavailable";
  return "server";
}

export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/api${path}`, {
        method: init?.method ?? "GET",
        headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new ApiError("offline", "Can't reach the Voxa API.");
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const message = typeof body?.message === "string" ? body.message : `Request failed (${response.status}).`;
      throw new ApiError(kindFor(response.status), message, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** A GET that answers audio. */
  async function audio(path: string): Promise<ArrayBuffer> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/api${path}`);
    } catch {
      throw new ApiError("offline", "Can't reach the Voxa API.");
    }
    if (!response.ok) throw new ApiError(kindFor(response.status), `Request failed (${response.status}).`, response.status);
    return response.arrayBuffer();
  }

  return {
    health: () => request<{ status: string }>("/health"),
    startSession: (mode: Mode, language = "en") =>
      request<StartedSession>("/sessions", { method: "POST", body: { mode, language } }),
    resumeSession: (sessionId: string) => request<ResumedSession>(`/sessions/${encodeURIComponent(sessionId)}`),
    sendTurn: (sessionId: string, text: string) =>
      request<TurnResult>(`/sessions/${encodeURIComponent(sessionId)}/turns`, { method: "POST", body: { text } }),
    endSession: (sessionId: string, timing?: SessionTiming) =>
      request<SessionSummary>(`/sessions/${encodeURIComponent(sessionId)}/end`, {
        method: "POST",
        body: timing ? { timing } : undefined,
      }),
    /** How ready the learner feels for this meeting type, 1 to 5. */
    rateConfidence: (sessionId: string, moment: ConfidenceMoment, value: number) =>
      request<void>(`/sessions/${encodeURIComponent(sessionId)}/confidence`, {
        method: "POST",
        body: { moment, value },
      }),
    /** WebSocket address of the live voice session (see lib/voice/voice-socket.ts). */
    voiceUrl: (sessionId: string) =>
      `${baseUrl.replace(/^http/, "ws")}/api/sessions/${encodeURIComponent(sessionId)}/voice`,
    /** The short lines played while the tutor prepares an answer, as WAV; empty when the language has none. */
    fillerSpeech: async (language = "en") => {
      const query = `language=${encodeURIComponent(language)}`;
      const { count } = await request<{ count: number }>(`/voice/fillers?${query}`);
      // One at a time: the voice server is also speaking the tutor's opening line.
      const clips: ArrayBuffer[] = [];
      for (let index = 0; index < count; index++) clips.push(await audio(`/voice/fillers/${index}?${query}`));
      return clips;
    },
    listMistakes: async (language = "en") =>
      (await request<{ mistakes: BankMistake[] }>(`/mistakes?language=${encodeURIComponent(language)}`)).mistakes,
    dismissMistake: (id: string, reason: DismissReason) =>
      request<void>(`/mistakes/${encodeURIComponent(id)}/dismiss`, { method: "POST", body: { reason } }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:3000");

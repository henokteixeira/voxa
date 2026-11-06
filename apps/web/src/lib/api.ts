/** Typed client for the Voxa API. Every call fails with ApiError, never a raw fetch error. */

export const MODES = ["presentation", "free_talk", "daily", "review"] as const;
export type Mode = (typeof MODES)[number];

export interface StartedSession {
  sessionId: string;
  mode: Mode;
  language: string;
  message: string;
}

export interface TurnResult {
  kind: "reply" | "hint" | "reveal";
  message: string;
  selfCorrected: boolean;
}

export interface SessionMistake {
  original: string;
  correction: string;
  category: string;
  severity: "serious" | "minor";
  selfCorrected: boolean;
  occurrences: number;
}

export interface SessionSummary {
  sessionId: string;
  mode: Mode;
  mistakes: SessionMistake[];
  selfCorrections: number;
}

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
    return (await response.json()) as T;
  }

  return {
    health: () => request<{ status: string }>("/health"),
    startSession: (mode: Mode, language = "en") =>
      request<StartedSession>("/sessions", { method: "POST", body: { mode, language } }),
    sendTurn: (sessionId: string, text: string) =>
      request<TurnResult>(`/sessions/${encodeURIComponent(sessionId)}/turns`, { method: "POST", body: { text } }),
    endSession: (sessionId: string) =>
      request<SessionSummary>(`/sessions/${encodeURIComponent(sessionId)}/end`, { method: "POST" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:3000");

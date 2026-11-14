import type {
  BankMistake,
  CefrLevel,
  CheckInOverview,
  CheckInResult,
  DailyMinutes,
  DismissReason,
  FasterRoundsView,
  LearnerFact,
  LevelView,
  MarkedStep,
  MissionModel,
  MissionView,
  Mode,
  PracticeView,
  ResumedSession,
  ReviewAnswer,
  ReviewCard,
  ReviewOverview,
  ReviewSubject,
  SessionSummary,
  SessionTiming,
  SignalsHistoryEntry,
  StartedSession,
  TodayProgress,
  SentenceHelp,
  TurnResult,
} from "@voxa/contracts";
import { reportError } from "./report-error";

/** Typed client for the Voxa API. Every call fails with ApiError, never a raw fetch error. */

// Shared with the API (see packages/contracts): its values, and the shapes of its responses.
export { CEFR_LEVELS, DAILY_MINUTES, FACT_TOPICS, MODES } from "@voxa/contracts";
export type {
  BankMistake,
  CefrLevel,
  CheckInOverview,
  CheckInPace,
  CheckInResult,
  DailyMinutes,
  DismissReason,
  FactTopic,
  FasterRound,
  FasterRoundsView,
  FluencySignals,
  FollowUp,
  Guidance,
  LearnerFact,
  LevelView,
  MissionExpression,
  MissionModel,
  MissionSituation,
  MissionSteps,
  MissionView,
  MistakePattern,
  MistakeStatus,
  Mode,
  PracticeNewWord,
  PracticePattern,
  PracticeView,
  ResumedSession,
  ReviewAnswer,
  ReviewCard,
  ReviewItem,
  ReviewOverview,
  ReviewStatus,
  ReviewSubject,
  SessionMistake,
  SessionSummary,
  SessionTiming,
  SessionXp,
  SignalComparison,
  SignalName,
  SignalsHistoryEntry,
  SpeakingLevel,
  StartedSession,
  StepChangeProposal,
  Takeaway,
  TodayProgress,
  TrackStage,
  TrackSupport,
  TrackView,
  Trend,
  SentenceHelp,
  TurnResult,
  XpAward,
  XpReason,
  MarkedStep as MarkedMissionStep,
} from "@voxa/contracts";

/** The categories the learner picks from, by group (the placement interview is offered on its own). */
export const EVERYDAY_MODES = ["free_talk", "my_day", "story", "opinion"] as const satisfies readonly Mode[];
export const WORK_MODES = ["daily", "presentation", "review"] as const satisfies readonly Mode[];

/** The category the API gives a word the learner said in their first language. Not a mistake. */
export const NEW_WORD_CATEGORY = "new_word";

/** The device's IANA time zone: days, the goal and the streak follow the learner's clock. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** What went wrong, in terms the screens can act on. */
export type ApiErrorKind = "offline" | "not_found" | "ended" | "tutor_unavailable" | "invalid" | "server";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  /** The server's id for the failed request: its log line carries the same id. */
  readonly requestId?: string;
  /** The server's error code (e.g. "tutor_unavailable"), for logs and bug reports. */
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, status?: number, requestId?: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.requestId = requestId;
    this.code = code;
  }
}

/** The error body the API answers (see apps/api/src/common/api-exception.filter.ts). */
interface ErrorBody {
  code?: unknown;
  message?: unknown;
  requestId?: unknown;
}

function kindFor(status: number): ApiErrorKind {
  if (status === 400) return "invalid";
  if (status === 404) return "not_found";
  if (status === 409) return "ended";
  if (status === 502 || status === 503) return "tutor_unavailable";
  return "server";
}

/** The ApiError for a failed response; unexpected server failures are reported. */
async function errorFrom(response: Response, where: string): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  const message = typeof body?.message === "string" ? body.message : `Request failed (${response.status}).`;
  const requestId =
    typeof body?.requestId === "string" ? body.requestId : (response.headers.get("x-request-id") ?? undefined);
  const code = typeof body?.code === "string" ? body.code : undefined;
  const error = new ApiError(kindFor(response.status), message, response.status, requestId, code);
  if (error.kind === "server") reportError(error, { where, status: response.status, requestId });
  return error;
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
    if (!response.ok) throw await errorFrom(response, `api ${init?.method ?? "GET"} ${path}`);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** A POST whose body is a recording (16 kHz WAV), answering JSON. */
  async function postAudio<T>(path: string, wav: ArrayBuffer): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/api${path}`, {
        method: "POST",
        headers: { "content-type": "audio/wav" },
        body: wav,
      });
    } catch {
      throw new ApiError("offline", "Can't reach the Voxa API.");
    }
    if (!response.ok) throw await errorFrom(response, `api POST ${path}`);
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
    if (!response.ok) throw await errorFrom(response, `api GET ${path}`);
    return response.arrayBuffer();
  }

  return {
    health: () => request<{ status: string }>("/health"),
    /** With `missionId`, the session is that daily mission's conversation (step 3). */
    startSession: (mode: Mode, language = "en", missionId?: string) =>
      request<StartedSession>("/sessions", { method: "POST", body: { mode, language, ...(missionId ? { missionId } : {}) } }),
    missionToday: (language = "en", timeZone = deviceTimeZone()) =>
      request<MissionView>(`/missions/today?language=${encodeURIComponent(language)}&timeZone=${encodeURIComponent(timeZone)}`),
    missionModel: (missionId: string) => request<MissionModel>(`/missions/${encodeURIComponent(missionId)}/model`),
    /** The model as speech (WAV). */
    missionSpeech: (missionId: string) => audio(`/missions/${encodeURIComponent(missionId)}/model/speech`),
    markMissionStep: (missionId: string, step: MarkedStep, timeZone = deviceTimeZone()) =>
      request<MissionView>(`/missions/${encodeURIComponent(missionId)}/steps/${step}`, { method: "POST", body: { timeZone } }),
    /** Step 2: whether the learner's sentence used the expression. */
    sayExpression: (missionId: string, expressionId: string, utterance: string) =>
      request<{ used: boolean }>(
        `/missions/${encodeURIComponent(missionId)}/expressions/${encodeURIComponent(expressionId)}/attempts`,
        { method: "POST", body: { utterance } },
      ),
    resumeSession: (sessionId: string) => request<ResumedSession>(`/sessions/${encodeURIComponent(sessionId)}`),
    sendTurn: (sessionId: string, text: string) =>
      request<TurnResult>(`/sessions/${encodeURIComponent(sessionId)}/turns`, { method: "POST", body: { text } }),
    /** "Help me": the start of a sentence and key words for the next answer. */
    sentenceHelp: (sessionId: string) => request<SentenceHelp>(`/sessions/${encodeURIComponent(sessionId)}/help`, { method: "POST" }),
    /** "I said it right": the pending mistake no longer counts, and the conversation goes on. */
    withdrawPending: (sessionId: string) =>
      request<void>(`/sessions/${encodeURIComponent(sessionId)}/pending/withdraw`, { method: "POST" }),
    /** The timing so far, after each turn. */
    saveTiming: (sessionId: string, timing: SessionTiming) =>
      request<void>(`/sessions/${encodeURIComponent(sessionId)}/timing`, { method: "PUT", body: timing }),
    endSession: (sessionId: string, timing?: SessionTiming) =>
      request<SessionSummary>(`/sessions/${encodeURIComponent(sessionId)}/end`, {
        method: "POST",
        body: timing ? { timing } : undefined,
      }),
    fasterRounds: (sessionId: string) => request<FasterRoundsView>(`/sessions/${encodeURIComponent(sessionId)}/faster-rounds`),
    recordFasterRound: (
      sessionId: string,
      round: { round: number; transcript: string; speechMs: number; longPausesMs: number[] },
    ) => request<FasterRoundsView>(`/sessions/${encodeURIComponent(sessionId)}/faster-rounds`, { method: "POST", body: round }),
    checkIns: (language = "en") => request<CheckInOverview>(`/check-ins?language=${encodeURIComponent(language)}`),
    /** The whole recording (WAV) with the speech time and the silences the app measured; `task` is the topic task's, if it is that one. */
    recordCheckIn: (wav: ArrayBuffer, measure: { speechMs: number; pausesMs: number[] }, language = "en", task?: string) => {
      const query = new URLSearchParams({ language, speechMs: String(measure.speechMs), pausesMs: measure.pausesMs.join(",") });
      if (task) query.set("task", task);
      return postAudio<CheckInResult>(`/check-ins?${query}`, wav);
    },
    checkIn: (id: string) => request<CheckInResult>(`/check-ins/${encodeURIComponent(id)}`),
    checkInRecording: (id: string) => audio(`/check-ins/${encodeURIComponent(id)}/recording`),
    level: (language = "en") => request<LevelView>(`/level?language=${encodeURIComponent(language)}`),
    /** The learner corrects the estimated level by hand. */
    setLevel: (level: CefrLevel, language = "en") =>
      request<LevelView>("/level", { method: "PUT", body: { language, level } }),
    /** The learner confirms the proposed step change (`to` is the proposed level). */
    confirmStepChange: (to: CefrLevel, language = "en") =>
      request<LevelView>("/level/step-change", { method: "POST", body: { language, to } }),
    /** The signals of the last practice sessions, oldest first. */
    signalsHistory: (language = "en") =>
      request<{ sessions: SignalsHistoryEntry[] }>(`/progress/signals?language=${encodeURIComponent(language)}`),
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
    learnerFacts: async () => (await request<{ facts: LearnerFact[] }>("/memory/facts")).facts,
    editLearnerFact: (id: string, statement: string) =>
      request<LearnerFact>(`/memory/facts/${encodeURIComponent(id)}`, { method: "PATCH", body: { statement } }),
    deleteLearnerFact: (id: string) => request<void>(`/memory/facts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    practice: (language = "en") => request<PracticeView>(`/practice?language=${encodeURIComponent(language)}`),
    reviewOverview: (language = "en") => request<ReviewOverview>(`/reviews?language=${encodeURIComponent(language)}`),
    /** A new cue for one pattern or new word. */
    reviewCard: (subject: ReviewSubject) => request<ReviewCard>("/reviews/cards", { method: "POST", body: { subject } }),
    /** What the learner said to a card; null when they chose "I don't know". */
    /** `startDelayMs`: from the cue showing to the learner starting to speak; null for a typed answer. */
    answerReview: (cardId: string, utterance: string | null, startDelayMs: number | null = null) =>
      request<ReviewAnswer>("/reviews/answers", {
        method: "POST",
        body: { cardId, utterance, timeZone: deviceTimeZone(), startDelayMs },
      }),
    /** The words in a short recording, e.g. a spoken review answer; empty when nothing was heard. */
    transcribe: async (wav: ArrayBuffer, language = "en") =>
      (await postAudio<{ text: string }>(`/voice/transcriptions?language=${encodeURIComponent(language)}`, wav)).text,
    todayProgress: (language = "en", timeZone = deviceTimeZone()) =>
      request<TodayProgress>(
        `/progress/today?language=${encodeURIComponent(language)}&timeZone=${encodeURIComponent(timeZone)}`,
      ),
    setDailyMinutes: (minutesPerDay: DailyMinutes, language = "en", timeZone = deviceTimeZone()) =>
      request<TodayProgress>("/progress/daily-goal", { method: "PUT", body: { language, timeZone, minutesPerDay } }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

// The API is served under /api on the app's own address (the dev server and nginx forward it), so the app works
// from any address it is opened at: localhost, the computer's IP or an HTTPS tunnel. VITE_API_URL overrides it.
export const api = createApiClient(import.meta.env.VITE_API_URL || window.location.origin);

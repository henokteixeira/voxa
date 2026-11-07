import { reportError } from "./report-error";

/** Typed client for the Voxa API. Every call fails with ApiError, never a raw fetch error. */

/** Every session mode: the four meetings, plus the placement interview that estimates the speaking level. */
export const MODES = ["presentation", "free_talk", "daily", "review", "placement"] as const;
export type Mode = (typeof MODES)[number];

/** The meetings the learner picks to practice (the placement interview is offered on its own). */
export const MEETING_MODES = ["presentation", "free_talk", "daily", "review"] as const satisfies readonly Mode[];

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** The learner's speaking level, an estimate that picks how much help sessions give. */
export interface SpeakingLevel {
  language: string;
  level: CefrLevel;
  source: "placement" | "manual" | "step_change";
  /** The learner's own lines that back the estimate. */
  evidence: string[];
  /** ISO 8601 date-time. */
  assessedAt: string;
}

export interface LevelView {
  current: (SpeakingLevel & { step: string }) | null;
  /** Suggest a placement interview: never done, or the last one is 4 weeks old. */
  placementDue: boolean;
  /** A different support step the last sessions point to; the learner confirms it. Missing from older servers. */
  proposal?: StepChangeProposal | null;
}

export interface StepChangeProposal {
  direction: "up" | "down";
  to: CefrLevel;
  /** The newest session the proposal rests on: a later session makes it a new proposal. */
  basedOn: string;
}

/** One practice session's signals, for the Progress tab. */
export interface SignalsHistoryEntry {
  sessionId: string;
  mode: Mode;
  /** ISO 8601 date-time. */
  recordedAt: string;
  signals: Required<FluencySignals>;
}

/** The stages of the guided track (A1–A2), in order. */
export type TrackStage = "model" | "swap" | "extend" | "answer" | "again";

/** Where the learner is in the guided track: the stage, as "step 2 of 5". */
export interface TrackView {
  stage: TrackStage;
  number: number;
  total: number;
}

/** The guided track and the words the tutor gave for the next turn. Missing from servers older than them. */
export interface Guidance {
  /** Null outside the guided track. */
  track?: TrackView | null;
  /** A model sentence, or a sentence start when stuck; null when there are no words to say. */
  scaffold?: string | null;
}

export interface StartedSession extends Guidance {
  sessionId: string;
  mode: Mode;
  language: string;
  message: string;
  /** Goals of the meeting, in order; empty in free talk. */
  goals: string[];
}

/** An open session as the server keeps it, to pick it up again after a reload. */
export interface ResumedSession extends Guidance {
  sessionId: string;
  mode: Mode;
  language: string;
  startedAt: string;
  turns: { role: "user" | "assistant"; content: string }[];
  goals: string[];
  coveredGoals: string[];
  /** The pending correction's hint step, without the correction. */
  hint: { hintsGiven: number; revealed: boolean; mistake?: string } | null;
}

export interface TurnResult extends Guidance {
  kind: "reply" | "hint" | "reveal";
  message: string;
  selfCorrected: boolean;
  /** Written help in the learner's first language, shown on screen and never spoken. */
  support?: string | null;
  /** On a hint: the learner's words that hold the mistake (never the correction). */
  mistake?: string | null;
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
  /** The pattern the mistake breaks; missing from older servers, null for new words and older mistakes. */
  pattern?: MistakePattern | null;
  patternId?: string | null;
}

/** A rule a mistake breaks: a short name and one line in the learner's first language. */
export interface MistakePattern {
  key: string;
  name: string;
  rule: string;
}

/** A pattern from the session for the learner to take away. */
export interface Takeaway {
  patternId: string;
  category: string;
  name: string;
  rule: string;
  /** The learner's words when they broke it. */
  said: string;
}

/** What a review asks for: a pattern from the bank, or one new word. */
export interface ReviewSubject {
  kind: "pattern" | "new_word";
  id: string;
}

/** A pattern or new word with its review schedule. */
export interface ReviewItem {
  subject: ReviewSubject;
  language: string;
  category: string;
  /** The pattern's name, or the new word. */
  name: string;
  /** The pattern's rule, or what the learner said in their first language. */
  rule: string;
  examples: { original: string; correction: string }[];
  step: number;
  /** ISO 8601 date-time. */
  dueAt: string;
}

/** One review question: a cue in the learner's first language. The answer stays on the server. */
export interface ReviewCard {
  cardId: string;
  item: ReviewItem;
  cue: string;
}

export interface ReviewAnswer {
  recalled: boolean;
  /** One way to say it. */
  answer: string;
  rule: string;
  /** ISO 8601 date-time: when the item comes back. */
  nextDueAt: string;
}

export interface ReviewOverview {
  due: ReviewItem[];
  /** When the next item not yet due comes back; null when there is none. */
  nextDueAt: string | null;
}

/** Timing measured during a live session (see features/session/fluency-clock.ts). */
export interface SessionTiming {
  learnerSpeechMs: number;
  tutorSpeechMs: number;
  pausesMs: number[];
  /** Silences of at least 1 s inside the learner's spoken answers. Missing in a timing saved before they were measured. */
  longPausesMs?: number[];
  /** Words the learner spoke (typed turns do not count). Missing in a timing saved before they were measured. */
  spokenWords?: number;
}

/** The fluency signals. Null when the session gave nothing to measure. */
export interface FluencySignals {
  /** 0–1: of the mistakes that got a hint, the share the learner fixed alone. */
  selfCorrectionRate: number | null;
  mistakesPer100Words: number | null;
  averagePauseMs: number | null;
  /** Words the learner spoke per minute of his own speech. */
  wordsPerMinute: number | null;
  /** Long silences inside his answers per minute of his own speech. */
  longPausesPerMinute: number | null;
  /** 0–1: share of the learner's turns said without help. Missing from servers older than it. */
  unaidedShare?: number | null;
}

export type SignalName = keyof Required<FluencySignals>;
export type Trend = "better" | "steady" | "worse";

/** How the session compares with the learner's last sessions (up to 3), signal by signal. */
export interface SignalComparison {
  sessions: number;
  signals: { name: SignalName; current: number; baseline: number; trend: Trend }[];
}

export interface SessionSummary {
  sessionId: string;
  mode: Mode;
  mistakes: SessionMistake[];
  selfCorrections: number;
  signals: FluencySignals;
  /** Null when there is nothing to compare yet (or after a placement interview); missing from older servers. */
  comparison?: SignalComparison | null;
  goals: { id: string; covered: boolean }[];
  /** Mistakes from the bank practiced in this session; `met` when the learner said the correct form. */
  targets: { original: string; correction: string; category: string; met: boolean }[];
  /** After a placement interview: the level it gave (null when nothing was said). Missing or null otherwise. */
  level?: SpeakingLevel | null;
  /** XP the session earned; missing from servers older than XP. */
  xp?: SessionXp;
  /** Up to 3 patterns to take away; missing from older servers, empty after a placement interview. */
  takeaways?: Takeaway[];
}

/** What earns XP. A mistake never takes XP away. */
export type XpReason = "practice_minute" | "goal_covered" | "self_corrected" | "personal_record";

export interface XpAward {
  reason: XpReason;
  /** How many times it happened: minutes, goals, self-corrections, records. */
  count: number;
  points: number;
}

export interface SessionXp {
  awards: XpAward[];
  total: number;
}

/** How long the learner wants to practice a day; the XP goal follows from it. */
export const DAILY_MINUTES = [15, 30, 45, 60] as const;
export type DailyMinutes = (typeof DAILY_MINUTES)[number];

/** Today's XP, goal and streak, in the learner's time zone. */
export interface TodayProgress {
  /** YYYY-MM-DD. */
  day: string;
  minutesPerDay: DailyMinutes;
  goalXp: number;
  earnedXp: number;
  goalMet: boolean;
  streakDays: number;
  /** XP for each reason, to show XP as it is earned. */
  points: Record<XpReason, number>;
}

/** The device's IANA time zone: days, the goal and the streak follow the learner's clock. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
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
    reviewOverview: (language = "en") => request<ReviewOverview>(`/reviews?language=${encodeURIComponent(language)}`),
    /** A new cue for one pattern or new word. */
    reviewCard: (subject: ReviewSubject) => request<ReviewCard>("/reviews/cards", { method: "POST", body: { subject } }),
    /** What the learner said to a card; null when they chose "I don't know". */
    answerReview: (cardId: string, utterance: string | null) =>
      request<ReviewAnswer>("/reviews/answers", { method: "POST", body: { cardId, utterance } }),
    todayProgress: (language = "en", timeZone = deviceTimeZone()) =>
      request<TodayProgress>(
        `/progress/today?language=${encodeURIComponent(language)}&timeZone=${encodeURIComponent(timeZone)}`,
      ),
    setDailyMinutes: (minutesPerDay: DailyMinutes, language = "en", timeZone = deviceTimeZone()) =>
      request<TodayProgress>("/progress/daily-goal", { method: "PUT", body: { language, timeZone, minutesPerDay } }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:3000");

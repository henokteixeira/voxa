import type { FollowUp, SessionSummary, TurnResult } from "@/lib/api";
import type { VoiceErrorCode } from "@/lib/voice/voice-socket";

/** What is happening in the live session. Pure reducer, so the flow is unit-tested. */
export type Phase =
  | "starting" // getting the microphone, creating the session, connecting
  | "thinking" // waiting for the transcript, the tutor or its voice
  | "speaking" // the tutor's voice is playing
  | "listening" // the learner's turn; nobody talking yet
  | "hearing" // the learner is talking
  | "paused"
  | "failed"
  | "ending"
  | "ended";

export type FailureCode =
  | VoiceErrorCode
  | "mic_blocked"
  | "mic_missing"
  | "mic_busy"
  | "mic_unsupported"
  | "start_failed";

export interface Caption {
  who: "tutor" | "you";
  text: string;
}

/** What the app asked the server for: a spoken turn, a typed turn, or the tutor's last line. */
export type Request = "audio" | "text" | "speak";

export interface Turn {
  request: Request;
  /** The typed text, kept so a failed send can be retried. */
  text: string | null;
  transcript: string | null;
  tutor: boolean;
  speech: boolean;
  /** The server finished this request ("done" or an error). */
  done: boolean;
}

export interface SessionState {
  phase: Phase;
  sessionId: string | null;
  captions: Caption[];
  /** Hints given for the current mistake: 0, 1 or 2. */
  hintStep: number;
  /** The learner's sentence the hint is about. */
  hintFor: string | null;
  /** The tutor gave the correct form and asked for a repeat. */
  revealed: boolean;
  /** The learner just fixed a mistake alone. */
  fixed: boolean;
  /** The tutor's written help in the learner's first language, for this turn only. Never spoken. */
  support: string | null;
  /** "Didn't catch that": the last turn held no speech. */
  missed: boolean;
  /** The browser blocked the tutor's voice until the page gets a tap. */
  audioBlocked: boolean;
  failure: FailureCode | null;
  /** What to resend on "Try again" after a failure mid-turn. */
  retry: Retry | null;
  turn: Turn;
  /** What the server returned when the session ended; null if it could not be reached. */
  summary: SessionSummary | null;
  /** Goals of the meeting, in order; empty in free talk. */
  goals: string[];
  coveredGoals: string[];
  /** The tutor asked whether to stop or keep going, and the learner has not answered yet. */
  checkIn: boolean;
}

export type Retry = { kind: "text"; text: string } | { kind: "speak" } | { kind: "listen" };

export type SessionAction =
  | { type: "started"; sessionId: string; message: string; goals?: string[] }
  | {
      type: "resumed";
      sessionId: string;
      captions: Caption[];
      goals: string[];
      coveredGoals: string[];
      hint: { hintsGiven: number; revealed: boolean } | null;
    }
  | { type: "keep_going" }
  | { type: "sent"; request: "audio" | "speak" }
  | { type: "sent"; request: "text"; text: string }
  | { type: "speech_start" }
  | { type: "transcript"; text: string }
  | { type: "tutor"; result: TurnResult }
  | { type: "followup"; result: FollowUp }
  | { type: "speech" }
  | { type: "playback_end" }
  | { type: "audio_blocked" }
  | { type: "done" }
  | { type: "failed"; code: FailureCode }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "recover" }
  | { type: "restart" }
  | { type: "ending" }
  | { type: "ended"; summary: SessionSummary | null };

const freshTurn = (request: Request, text: string | null = null): Turn => ({
  request,
  text,
  transcript: null,
  tutor: false,
  speech: false,
  done: false,
});

export const initialSessionState: SessionState = {
  phase: "starting",
  sessionId: null,
  captions: [],
  hintStep: 0,
  hintFor: null,
  revealed: false,
  fixed: false,
  support: null,
  missed: false,
  audioBlocked: false,
  failure: null,
  retry: null,
  turn: freshTurn("speak"),
  summary: null,
  goals: [],
  coveredGoals: [],
  checkIn: false,
};

/** Failures that do not stop the session: say "didn't catch that" and listen again. */
const SOFT_FAILURES: FailureCode[] = ["bad_audio", "invalid", "too_long"];
const OVER: Phase[] = ["ending", "ended"];

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  // Nothing brings an ended session back.
  if (OVER.includes(state.phase) && action.type !== "ended") return state;

  switch (action.type) {
    case "started":
      if (state.phase !== "starting") return state;
      return {
        ...state,
        phase: "thinking",
        sessionId: action.sessionId,
        captions: [{ who: "tutor", text: action.message }],
        goals: action.goals ?? [],
      };
    case "resumed": {
      // After a reload: paused until a tap (the browser needs one to play and record), then the tutor's last line again.
      if (state.phase !== "starting") return state;
      const hint = action.hint;
      return {
        ...state,
        phase: "paused",
        sessionId: action.sessionId,
        captions: action.captions,
        goals: action.goals,
        coveredGoals: action.coveredGoals,
        hintStep: hint && !hint.revealed ? Math.min(2, hint.hintsGiven) : 0,
        hintFor: hint ? (action.captions.findLast((c) => c.who === "you")?.text ?? null) : null,
        revealed: hint?.revealed ?? false,
        turn: freshTurn("speak"),
      };
    }
    case "keep_going":
      return { ...state, checkIn: false };
    case "sent":
      return {
        ...state,
        phase: "thinking",
        missed: false,
        fixed: false,
        support: null,
        checkIn: false,
        failure: null,
        retry: null,
        turn: freshTurn(action.request, action.request === "text" ? action.text : null),
      };
    case "speech_start":
      return state.phase === "listening" ? { ...state, phase: "hearing", missed: false } : state;
    case "transcript": {
      // A retried typed turn comes back with the same words: don't caption them twice.
      const last = state.captions.at(-1);
      const repeat = state.turn.request === "text" && last?.who === "you" && last.text === action.text;
      return {
        ...state,
        captions: repeat ? state.captions : [...state.captions, { who: "you", text: action.text }],
        turn: { ...state.turn, transcript: action.text },
      };
    }
    case "tutor":
      return {
        ...withTutor(state, action.result),
        support: action.result.support ?? null,
        checkIn: action.result.checkIn ?? false,
        coveredGoals: action.result.coveredGoals ?? state.coveredGoals,
        turn: { ...state.turn, tutor: true },
      };
    case "followup": {
      // Spoken after the reply: a hint about what the learner just said, or the stop-or-keep-going question.
      const { message } = action.result;
      // A spoken reply-kind line (the stop-or-keep-going question) keeps what the reply said about a fix.
      const base = message
        ? { ...withTutor(state, { ...action.result, message }), ...(action.result.kind === "reply" ? { fixed: state.fixed } : {}) }
        : state;
      return {
        ...base,
        support: action.result.support ?? state.support,
        checkIn: action.result.checkIn ?? state.checkIn,
        coveredGoals: action.result.coveredGoals ?? state.coveredGoals,
      };
    }
    case "speech":
      if (state.phase !== "thinking") return { ...state, turn: { ...state.turn, speech: true } };
      return { ...state, phase: "speaking", audioBlocked: false, turn: { ...state.turn, speech: true } };
    case "playback_end":
      return state.phase === "speaking" ? { ...state, phase: state.turn.done ? "listening" : "thinking" } : state;
    case "audio_blocked":
      return { ...state, audioBlocked: true };
    case "done": {
      const turn = { ...state.turn, done: true };
      if (state.phase !== "thinking") return { ...state, turn };
      // A spoken turn that came back without a transcript held no speech.
      return { ...state, turn, phase: "listening", missed: turn.request === "audio" && turn.transcript === null };
    }
    case "failed": {
      // "busy" is out of band: the running request carries on.
      if (action.code === "busy") return state;
      const turn = { ...state.turn, done: true };
      if (SOFT_FAILURES.includes(action.code)) {
        return { ...state, turn, phase: state.phase === "paused" ? "paused" : "listening", missed: true };
      }
      return { ...state, turn, phase: "failed", failure: action.code, retry: retryFor(state) };
    }
    case "pause":
      return state.phase === "failed" || state.phase === "starting" ? state : { ...state, phase: "paused" };
    case "resume":
      if (state.phase !== "paused") return state;
      return { ...state, phase: state.turn.done ? "listening" : "thinking" };
    case "recover":
      return state.phase === "failed" ? { ...state, phase: "listening", failure: null, retry: null } : state;
    case "restart":
      return initialSessionState;
    case "ending":
      return { ...state, phase: "ending" };
    case "ended":
      return { ...state, phase: "ended", summary: action.summary };
  }
}

function withTutor(state: SessionState, result: TurnResult): SessionState {
  const captions = [...state.captions, { who: "tutor" as const, text: result.message }];
  const said = state.turn.transcript;
  if (result.kind === "hint") {
    const first = state.hintStep === 0 || state.revealed;
    return {
      ...state,
      captions,
      hintStep: first ? 1 : Math.min(2, state.hintStep + 1),
      hintFor: first ? said : (state.hintFor ?? said),
      revealed: false,
      fixed: false,
    };
  }
  if (result.kind === "reveal") return { ...state, captions, revealed: true, fixed: false };
  return { ...state, captions, hintStep: 0, hintFor: null, revealed: false, fixed: result.selfCorrected };
}

/** After a failure, what "Try again" should do so the learner does not repeat themselves for nothing. */
function retryFor(state: SessionState): Retry {
  const { turn } = state;
  if (turn.tutor || turn.request === "speak") return { kind: "speak" };
  const text = turn.transcript ?? turn.text;
  if (text) return { kind: "text", text };
  return { kind: "listen" };
}

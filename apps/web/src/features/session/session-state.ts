import type { TurnResult } from "@/lib/api";
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

export type FailureCode = VoiceErrorCode | "mic_blocked" | "mic_missing" | "mic_unsupported" | "start_failed";

export interface Caption {
  who: "tutor" | "you";
  text: string;
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
  /** "Didn't catch that": the last turn held no speech. */
  missed: boolean;
  failure: FailureCode | null;
  /** What to resend on "Try again" after a failure mid-turn. */
  retry: { kind: "text"; text: string } | { kind: "speak" } | { kind: "listen" } | null;
  /** Inside the current request. */
  turn: { request: Request; transcript: string | null; tutor: boolean; speech: boolean };
  mistakesSaved: number | null;
}

/** What the app asked the server for: a spoken turn, a typed turn, or the tutor's last line. */
export type Request = "audio" | "text" | "speak";

export type SessionAction =
  | { type: "started"; sessionId: string; message: string }
  | { type: "sent"; request: Request }
  | { type: "speech_start" }
  | { type: "transcript"; text: string }
  | { type: "tutor"; result: TurnResult }
  | { type: "speech" }
  | { type: "playback_end" }
  | { type: "done" }
  | { type: "failed"; code: FailureCode }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "ending" }
  | { type: "recover" }
  | { type: "ended"; mistakes: number | null };

const freshTurn = (request: Request) => ({ request, transcript: null, tutor: false, speech: false });

export const initialSessionState: SessionState = {
  phase: "starting",
  sessionId: null,
  captions: [],
  hintStep: 0,
  hintFor: null,
  revealed: false,
  fixed: false,
  missed: false,
  failure: null,
  retry: null,
  turn: freshTurn("speak"),
  mistakesSaved: null,
};

/** Failures that do not stop the session: say so and listen again. */
const SOFT_FAILURES: FailureCode[] = ["bad_audio", "busy", "invalid", "too_long"];

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "started":
      return {
        ...state,
        phase: "thinking",
        sessionId: action.sessionId,
        captions: [{ who: "tutor", text: action.message }],
      };
    case "sent":
      return { ...state, phase: "thinking", missed: false, fixed: false, failure: null, retry: null, turn: freshTurn(action.request) };
    case "speech_start":
      return state.phase === "listening" ? { ...state, phase: "hearing", missed: false } : state;
    case "transcript":
      return {
        ...state,
        captions: [...state.captions, { who: "you", text: action.text }],
        turn: { ...state.turn, transcript: action.text },
      };
    case "tutor":
      return { ...withTutor(state, action.result), turn: { ...state.turn, tutor: true } };
    case "speech":
      return { ...state, phase: state.phase === "paused" ? "paused" : "speaking", turn: { ...state.turn, speech: true } };
    case "playback_end":
      return state.phase === "speaking" ? { ...state, phase: "listening" } : state;
    case "done": {
      if (state.phase !== "thinking") return state;
      // A spoken turn that came back without a transcript held no speech.
      return { ...state, phase: "listening", missed: state.turn.request === "audio" && state.turn.transcript === null };
    }
    case "failed": {
      if (SOFT_FAILURES.includes(action.code)) return { ...state, phase: "listening", missed: true };
      return { ...state, phase: "failed", failure: action.code, retry: retryFor(state) };
    }
    case "pause":
      return state.phase === "failed" || state.phase === "ended" ? state : { ...state, phase: "paused" };
    case "resume":
      return state.phase === "paused" ? { ...state, phase: "listening" } : state;
    case "recover":
      return state.phase === "failed" ? { ...state, phase: "listening", failure: null, retry: null } : state;
    case "ending":
      return { ...state, phase: "ending" };
    case "ended":
      return { ...state, phase: "ended", mistakesSaved: action.mistakes };
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
function retryFor(state: SessionState): SessionState["retry"] {
  if (state.turn.tutor || state.turn.request === "speak") return { kind: "speak" };
  if (state.turn.transcript) return { kind: "text", text: state.turn.transcript };
  return { kind: "listen" };
}

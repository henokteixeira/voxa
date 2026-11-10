import type { FollowUp, Guidance, SessionSummary, TrackView, TurnResult } from "@/lib/api";
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
  | "start_failed"
  // The session could not start because the tutor (Claude) didn't answer.
  | "tutor_start_failed";

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
  /** The recorded speech (WAV), kept until its transcript comes back so a failed send can be retried. */
  audio: ArrayBuffer | null;
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
  /** The current mistake's type (e.g. verb_tense), named on the hint card; null when unknown. */
  mistakeType: string | null;
  /** With the correct form: the rule the mistake breaks. */
  rule: { name: string; rule: string } | null;
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
  /** Goals of the session, in order; empty in free talk. */
  goals: string[];
  coveredGoals: string[];
  /** The tutor asked whether to stop or keep going, and the learner has not answered yet. */
  checkIn: boolean;
  /** Where the learner is in the guided track (A1–A2), or null. */
  track: TrackView | null;
  /** Words the tutor gave for the next turn, or null. */
  scaffold: string | null;
}

export type Retry =
  | { kind: "text"; text: string }
  | { kind: "audio"; audio: ArrayBuffer }
  | { kind: "speak" }
  | { kind: "listen" };

export type SessionAction =
  | ({ type: "started"; sessionId: string; message: string; goals?: string[] } & Guidance)
  | ({
      type: "resumed";
      sessionId: string;
      captions: Caption[];
      goals: string[];
      coveredGoals: string[];
      hint: { hintsGiven: number; revealed: boolean; mistake?: string; mistakeType?: string; rule?: { name: string; rule: string } | null } | null;
    } & Guidance)
  | { type: "keep_going" }
  | { type: "sent"; request: "audio"; audio: ArrayBuffer }
  | { type: "sent"; request: "speak" }
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

const freshTurn = (request: Request, text: string | null = null, audio: ArrayBuffer | null = null): Turn => ({
  request,
  text,
  audio,
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
  mistakeType: null,
  rule: null,
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
  track: null,
  scaffold: null,
};

/** Failures that do not stop the session: say "didn't catch that" and listen again. */
const SOFT_FAILURES: FailureCode[] = ["bad_audio", "invalid", "too_long"];
const OVER: Phase[] = ["ending", "ended"];

/** The tutor is speaking this turn, including the short gap while the next part of its voice is still on its way. */
export function tutorSpeaking(state: SessionState): boolean {
  return state.phase === "speaking" || (state.phase === "thinking" && state.turn.speech && !state.turn.done);
}

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
        ...guidance(state, action),
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
        hintFor: hint?.mistake ?? null,
        revealed: hint?.revealed ?? false,
        mistakeType: hint?.mistakeType ?? null,
        rule: hint?.revealed ? (hint.rule ?? null) : null,
        turn: freshTurn("speak"),
        ...guidance(state, action),
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
        turn: freshTurn(
          action.request,
          action.request === "text" ? action.text : null,
          action.request === "audio" ? action.audio : null,
        ),
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
        // The server has the words now: a retry sends them, not the recording.
        turn: { ...state.turn, transcript: action.text, audio: null },
        // The words to say have done their job once the learner answers: they leave the screen.
        scaffold: null,
      };
    }
    case "tutor":
      return {
        ...withTutor(state, action.result),
        support: action.result.support ?? null,
        checkIn: action.result.checkIn ?? false,
        coveredGoals: action.result.coveredGoals ?? state.coveredGoals,
        turn: { ...state.turn, tutor: true },
        ...guidance(state, action.result),
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
        ...guidance(state, action.result),
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
      // A finished turn has nothing left to resend.
      const turn = { ...state.turn, done: true, audio: null };
      if (state.phase !== "thinking") return { ...state, turn };
      // A spoken turn that came back without a transcript held no speech.
      return { ...state, turn, phase: "listening", missed: turn.request === "audio" && turn.transcript === null };
    }
    case "failed": {
      // "busy" is out of band: the running request carries on.
      if (action.code === "busy") return state;
      const turn = { ...state.turn, done: true };
      if (SOFT_FAILURES.includes(action.code)) {
        // A recording the server could not use is not worth sending again.
        return { ...state, turn: { ...turn, audio: null }, phase: state.phase === "paused" ? "paused" : "listening", missed: true };
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

/** The track and the words to say, as the server sent them; an older server sends neither, so they stay. */
function guidance(state: SessionState, from: Guidance): Pick<SessionState, "track" | "scaffold"> {
  return {
    track: from.track === undefined ? state.track : from.track,
    scaffold: from.scaffold === undefined ? state.scaffold : from.scaffold,
  };
}

function withTutor(state: SessionState, result: TurnResult): SessionState {
  const captions = [...state.captions, { who: "tutor" as const, text: result.message }];
  if (result.kind === "hint") {
    // Only the words with the mistake, never the whole answer: the hint stays the focus.
    const said = result.mistake ?? null;
    const first = state.hintStep === 0 || state.revealed;
    return {
      ...state,
      captions,
      hintStep: first ? 1 : Math.min(2, state.hintStep + 1),
      hintFor: first ? said : (state.hintFor ?? said),
      mistakeType: result.mistakeType ?? (first ? null : state.mistakeType),
      rule: null,
      revealed: false,
      fixed: false,
    };
  }
  if (result.kind === "reveal") {
    const mistakeType = result.mistakeType ?? state.mistakeType;
    return { ...state, captions, mistakeType, rule: result.rule ?? null, revealed: true, fixed: false };
  }
  return { ...state, captions, hintStep: 0, hintFor: null, mistakeType: null, rule: null, revealed: false, fixed: result.selfCorrected };
}

/** After a failure, what "Try again" should do so the learner does not repeat themselves for nothing. */
function retryFor(state: SessionState): Retry {
  const { turn } = state;
  if (turn.tutor || turn.request === "speak") return { kind: "speak" };
  const text = turn.transcript ?? turn.text;
  if (text) return { kind: "text", text };
  // The speech never became text (e.g. speech recognition timed out): send the same recording again.
  if (turn.audio) return { kind: "audio", audio: turn.audio };
  return { kind: "listen" };
}

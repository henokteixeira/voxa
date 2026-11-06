import type { BallState } from "@/components/voice-ball";
import { STATE_LABEL } from "@/components/voice-ball-state";
import type { FailureCode, SessionState } from "./session-state";

/** The ball's state and the line under it, from the session state. */
export function stageFor(state: SessionState): { ball: BallState; label: string; hint?: string } {
  const yourTurn = state.phase === "listening" || state.phase === "hearing";
  if (state.phase === "failed") return { ball: "idle", label: "Waiting for Voxa" };
  if (state.phase === "paused") return { ball: "idle", label: "Paused" };
  if (state.fixed && !yourTurn) return { ball: "success", label: "Nice" };
  if (state.phase === "speaking") return { ball: "speaking", label: "Speaking" };
  if (yourTurn && state.revealed) return { ball: "listening", label: "Say it once so it sticks" };
  if (yourTurn && state.hintStep > 0) {
    return { ball: "hint", label: state.hintStep === 1 ? "Hint · say it again" : "Hint · one more try" };
  }
  if (state.phase === "hearing") {
    return { ball: "listening", label: "Listening", hint: "Pause for a second to send · tap to send now" };
  }
  if (state.phase === "listening") {
    return {
      ball: "listening",
      label: "Your turn",
      hint: state.missed ? "Didn't catch that. Too quiet, or too much noise around you." : "Just talk. Voxa hears when you stop.",
    };
  }
  return { ball: "thinking", label: "Thinking" };
}

export function labelClass(ball: BallState): string {
  return STATE_LABEL[ball].className;
}

interface FailureCopy {
  title: string;
  body: string;
  action: string;
  steps?: string[];
  command?: string;
}

const MIC_STEPS = [
  "Click the lock icon next to the address.",
  "Set Microphone to Allow.",
  "Come back and tap Try again.",
];

export const FAILURE_COPY: Record<FailureCode, FailureCopy> = {
  mic_blocked: { title: "Voxa can't hear you", body: "The browser is blocking the microphone.", action: "Try again", steps: MIC_STEPS },
  mic_missing: { title: "No microphone found", body: "Plug in a microphone or a headset, then try again.", action: "Try again" },
  mic_unsupported: { title: "This browser can't record", body: "Open Voxa in a recent Chrome, Edge or Safari.", action: "Try again" },
  start_failed: {
    title: "The session didn't start",
    body: "Check that Voxa's server is running on your PC:",
    command: "pnpm dev:api",
    action: "Try again",
  },
  voice_unavailable: {
    title: "The voice server isn't running",
    body: "Speech recognition and the tutor's voice run on your PC. Start it there:",
    command: "cd services/voice && uvicorn main:app --port 8001",
    action: "Check again",
  },
  tutor_unavailable: {
    title: "The tutor didn't answer",
    body: "Your session is saved, with your last sentence.",
    action: "Try again",
  },
  disconnected: { title: "Lost the connection", body: "Your session is saved.", action: "Reconnect" },
  in_use: { title: "This session is open in another tab", body: "Close the other tab, then try again.", action: "Try again" },
  not_found: { title: "This session can't continue", body: "Start a new one from Today.", action: "Try again" },
  ended: { title: "This session has ended", body: "Start a new one from Today.", action: "Try again" },
  server: { title: "Something went wrong", body: "Your session is saved up to your last sentence.", action: "Try again" },
  bad_audio: { title: "Didn't catch that", body: "Try saying it again.", action: "Try again" },
  busy: { title: "Still answering", body: "Wait for the tutor, then speak.", action: "Try again" },
  invalid: { title: "Something went wrong", body: "Try again.", action: "Try again" },
  too_long: { title: "That turn was too long", body: "Keep each turn under a minute.", action: "Try again" },
};

/** Failures where trying again cannot help: only leaving makes sense. */
export const FINAL_FAILURES: FailureCode[] = ["not_found", "ended"];

import { useCallback, useContext, useEffect, useReducer, useRef, useState } from "react";
import { useApi } from "@/hooks/use-api";
import type { Mode } from "@/lib/api";
import { type Microphone, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import type { Speaker } from "@/lib/voice/speaker";
import type { VoiceSocket } from "@/lib/voice/voice-socket";
import { type FailureCode, initialSessionState, sessionReducer } from "./session-state";
import { VoiceDepsContext } from "./voice-deps";

/** Failures that need the whole start again (no session was created yet). */
const START_FAILURES: FailureCode[] = ["mic_blocked", "mic_missing", "mic_unsupported", "start_failed"];
/** Failures that need a new socket on the same session. */
const SOCKET_FAILURES: FailureCode[] = ["disconnected", "in_use"];

/** Runs a live voice session: microphone → socket → tutor's voice, driven by sessionReducer. */
export function useVoiceSession(mode: Mode) {
  const api = useApi();
  const deps = useContext(VoiceDepsContext);
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [attempt, setAttempt] = useState(0);
  const mic = useRef<Microphone | null>(null);
  const socket = useRef<VoiceSocket | null>(null);
  const speaker = useRef<Speaker | null>(null);

  const connect = useCallback(
    (sessionId: string) => {
      socket.current?.close();
      const ws = deps.openVoiceSocket(api.voiceUrl(sessionId), {
        onOpen: () => {
          dispatch({ type: "sent", request: "speak" });
          ws.speakLast();
        },
        onTranscript: (text) => dispatch({ type: "transcript", text }),
        onTutor: (result) => dispatch({ type: "tutor", result }),
        onSpeech: (wav) => {
          dispatch({ type: "speech" });
          // Captions already show the line; if the browser blocks audio, just move on.
          void speaker.current
            ?.play(wav)
            .catch(() => {})
            .finally(() => dispatch({ type: "playback_end" }));
        },
        onError: (code) => dispatch({ type: "failed", code }),
        onDone: () => dispatch({ type: "done" }),
      });
      socket.current = ws;
    },
    [api, deps],
  );

  // Start: microphone first (no session is created if it is blocked), then the session, then the socket.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opened = await deps.openMicrophone({
          onSpeechStart: () => dispatch({ type: "speech_start" }),
          onTurn: (wav) => {
            mic.current?.pause();
            dispatch({ type: "sent", request: "audio" });
            socket.current?.sendTurn(wav);
          },
        });
        if (cancelled) return opened.stop();
        opened.pause();
        mic.current = opened;
      } catch (error) {
        const reason = error instanceof MicrophoneUnavailableError ? error.reason : "blocked";
        if (!cancelled) dispatch({ type: "failed", code: `mic_${reason}` });
        return;
      }
      try {
        const started = await api.startSession(mode);
        if (cancelled) return;
        speaker.current = deps.createSpeaker();
        dispatch({ type: "started", sessionId: started.sessionId, message: started.message });
        connect(started.sessionId);
      } catch {
        if (!cancelled) dispatch({ type: "failed", code: "start_failed" });
      }
    })();
    return () => {
      cancelled = true;
      mic.current?.stop();
      socket.current?.close();
      speaker.current?.close();
      mic.current = socket.current = speaker.current = null;
    };
  }, [api, deps, mode, connect, attempt]);

  // The microphone listens only on the learner's turn, so it never hears the tutor.
  const listening = state.phase === "listening" || state.phase === "hearing";
  useEffect(() => {
    if (listening) mic.current?.resume();
    else mic.current?.pause();
  }, [listening]);

  const sendText = useCallback((text: string) => {
    dispatch({ type: "sent", request: "text" });
    socket.current?.sendText(text);
  }, []);

  const repeatLast = useCallback(() => {
    speaker.current?.stop();
    dispatch({ type: "sent", request: "speak" });
    socket.current?.speakLast();
  }, []);

  /** Tap the ball: send early while talking, interrupt the tutor while it speaks. */
  const tapBall = useCallback(() => {
    if (state.phase === "hearing") mic.current?.sendNow();
    else if (state.phase === "speaking") speaker.current?.stop();
  }, [state.phase]);

  const pause = useCallback(() => {
    speaker.current?.stop();
    dispatch({ type: "pause" });
  }, []);

  const resume = useCallback(() => dispatch({ type: "resume" }), []);

  const retry = useCallback(() => {
    const { failure, retry: next, sessionId } = state;
    if (failure && START_FAILURES.includes(failure)) return setAttempt((n) => n + 1);
    if (failure && SOCKET_FAILURES.includes(failure) && sessionId) return connect(sessionId);
    if (next?.kind === "text") return sendText(next.text);
    if (next?.kind === "speak") return repeatLast();
    dispatch({ type: "recover" });
  }, [state, connect, sendText, repeatLast]);

  const end = useCallback(async () => {
    const { sessionId } = state;
    dispatch({ type: "ending" });
    mic.current?.stop();
    socket.current?.close();
    speaker.current?.stop();
    if (!sessionId) return dispatch({ type: "ended", mistakes: null });
    try {
      const summary = await api.endSession(sessionId);
      dispatch({ type: "ended", mistakes: summary.mistakes.length });
    } catch {
      dispatch({ type: "ended", mistakes: null });
    }
  }, [api, state]);

  return { state, tapBall, pause, resume, repeatLast, sendText, retry, end };
}

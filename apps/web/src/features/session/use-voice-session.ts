import { useCallback, useContext, useEffect, useReducer, useRef, useState } from "react";
import { useApi } from "@/hooks/use-api";
import type { Mode } from "@/lib/api";
import { type Microphone, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { AudioBlockedError, type Speaker } from "@/lib/voice/speaker";
import type { VoiceSocket } from "@/lib/voice/voice-socket";
import { type FailureCode, initialSessionState, type Retry, sessionReducer } from "./session-state";
import { VoiceDepsContext } from "./voice-deps";

/** Failures that need the whole start again (no session was created yet). */
const START_FAILURES: FailureCode[] = ["mic_blocked", "mic_missing", "mic_busy", "mic_unsupported", "start_failed"];
/** Failures that need a new socket on the same session. */
const SOCKET_FAILURES: FailureCode[] = ["disconnected", "in_use"];

/** What to send once a (re)connected socket opens. */
type OnOpen = Retry | { kind: "nothing" };

/** Runs a live voice session: microphone → socket → tutor's voice, driven by sessionReducer. */
export function useVoiceSession(mode: Mode) {
  const api = useApi();
  const deps = useContext(VoiceDepsContext);
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [attempt, setAttempt] = useState(0);
  const [typing, setTyping] = useState(false);
  const mic = useRef<Microphone | null>(null);
  const socket = useRef<VoiceSocket | null>(null);
  const speaker = useRef<Speaker | null>(null);
  const sessionId = useRef<string | null>(null);
  const ended = useRef(false);
  const paused = useRef(false);
  /** The tutor spoke while the pause sheet was open; say it again on resume. */
  const missedSpeech = useRef(false);
  useEffect(() => {
    paused.current = state.phase === "paused";
  }, [state.phase]);

  const connect = useCallback(
    function connectSocket(id: string, onOpen: OnOpen) {
      socket.current?.close();
      const ws = deps.openVoiceSocket(api.voiceUrl(id), {
        onOpen: () => {
          if (onOpen.kind === "speak") {
            dispatch({ type: "sent", request: "speak" });
            ws.speakLast();
          } else if (onOpen.kind === "text") {
            dispatch({ type: "sent", request: "text", text: onOpen.text });
            ws.sendText(onOpen.text);
          } else if (onOpen.kind === "listen") {
            dispatch({ type: "recover" });
          }
        },
        onTranscript: (text) => dispatch({ type: "transcript", text }),
        onTutor: (result) => dispatch({ type: "tutor", result }),
        onSpeech: (wav) => {
          dispatch({ type: "speech" });
          if (paused.current) {
            missedSpeech.current = true;
            return;
          }
          // Captions already show the line; if the browser blocks audio, ask for a tap.
          void speaker.current
            ?.play(wav)
            .catch((error: unknown) => {
              if (error instanceof AudioBlockedError) dispatch({ type: "audio_blocked" });
            })
            .finally(() => dispatch({ type: "playback_end" }));
        },
        onError: (code) => {
          dispatch({ type: "failed", code });
          // The server closed the socket for a frame that was too big: reconnect quietly.
          if (code === "too_long") connectSocket(id, { kind: "nothing" });
        },
        onDone: () => dispatch({ type: "done" }),
      });
      socket.current = ws;
    },
    [api, deps],
  );

  // Start: microphone first (no session is created if it is blocked), then the session, then the socket.
  useEffect(() => {
    let cancelled = false;
    ended.current = false;
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
        sessionId.current = started.sessionId;
        // The learner left or ended before the session existed: close it on the server too.
        if (cancelled || ended.current) return void api.endSession(started.sessionId).catch(() => {});
        speaker.current = deps.createSpeaker();
        dispatch({ type: "started", sessionId: started.sessionId, message: started.message });
        connect(started.sessionId, { kind: "speak" });
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
      // Leaving mid-session (back button): close it on the server, best effort.
      if (sessionId.current && !ended.current) void api.endSession(sessionId.current).catch(() => {});
      sessionId.current = null;
    };
  }, [api, deps, mode, connect, attempt]);

  // The microphone listens only on the learner's turn (and not while typing), so it never hears the tutor.
  const listening = (state.phase === "listening" || state.phase === "hearing") && !typing;
  useEffect(() => {
    if (listening) mic.current?.resume();
    else mic.current?.pause();
  }, [listening]);

  const sendText = useCallback((text: string) => {
    setTyping(false);
    dispatch({ type: "sent", request: "text", text });
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

  /** Any tap on the screen: lets the browser play and record, and replays a line it blocked. */
  const unlock = useCallback(() => {
    speaker.current?.unlock();
    mic.current?.unlock();
    if (state.audioBlocked && state.turn.done && state.phase === "listening") repeatLast();
  }, [state.audioBlocked, state.turn.done, state.phase, repeatLast]);

  const pause = useCallback(() => {
    speaker.current?.stop();
    dispatch({ type: "pause" });
  }, []);

  const resume = useCallback(() => {
    dispatch({ type: "resume" });
    if (missedSpeech.current && state.turn.done) {
      missedSpeech.current = false;
      repeatLast();
    }
  }, [state.turn.done, repeatLast]);

  const retry = useCallback(() => {
    const { failure, retry: next } = state;
    if (failure && START_FAILURES.includes(failure)) {
      dispatch({ type: "restart" });
      return setAttempt((n) => n + 1);
    }
    if (failure && SOCKET_FAILURES.includes(failure) && state.sessionId) {
      return connect(state.sessionId, next ?? { kind: "listen" });
    }
    if (next?.kind === "text") return sendText(next.text);
    if (next?.kind === "speak") return repeatLast();
    dispatch({ type: "recover" });
  }, [state, connect, sendText, repeatLast]);

  const end = useCallback(async () => {
    ended.current = true;
    const id = state.sessionId;
    dispatch({ type: "ending" });
    mic.current?.stop();
    socket.current?.close();
    speaker.current?.stop();
    mic.current = socket.current = null;
    if (!id) return dispatch({ type: "ended", mistakes: null });
    try {
      const summary = await api.endSession(id);
      dispatch({ type: "ended", mistakes: summary.mistakes.length });
    } catch {
      dispatch({ type: "ended", mistakes: null });
    }
  }, [api, state.sessionId]);

  return { state, typing, setTyping, tapBall, unlock, pause, resume, repeatLast, sendText, retry, end };
}

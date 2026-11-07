import { useCallback, useContext, useEffect, useReducer, useRef, useState } from "react";
import { useApi } from "@/hooks/use-api";
import type { ApiClient, ConfidenceMoment, Mode } from "@/lib/api";
import { type Microphone, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { DEFAULT_TURN_OPTIONS } from "@/lib/voice/turn-detector";
import { createFillerPlayer } from "@/lib/voice/filler-player";
import { AudioBlockedError, type Speaker } from "@/lib/voice/speaker";
import type { VoiceSocket } from "@/lib/voice/voice-socket";
import { FluencyClock } from "./fluency-clock";
import { type FailureCode, initialSessionState, type Retry, sessionReducer } from "./session-state";
import { VoiceDepsContext } from "./voice-deps";

/** Failures that need the whole start again (no session was created yet). */
const START_FAILURES: FailureCode[] = ["mic_blocked", "mic_missing", "mic_busy", "mic_unsupported", "start_failed"];
/** Failures that need a new socket on the same session. */
const SOCKET_FAILURES: FailureCode[] = ["disconnected", "in_use"];

/** Stores a confidence rating without holding up the screen; one retry if the first try fails. */
function rateConfidence(api: ApiClient, sessionId: string, moment: ConfidenceMoment, value: number) {
  return api
    .rateConfidence(sessionId, moment, value)
    .catch(() => new Promise((resolve) => setTimeout(resolve, 2000)).then(() => api.rateConfidence(sessionId, moment, value)))
    .catch(() => {});
}

/** What to send once a (re)connected socket opens. */
type OnOpen = Retry | { kind: "nothing" };

/** Runs a live voice session: microphone → socket → tutor's voice, driven by sessionReducer. */
export function useVoiceSession(mode: Mode, confidenceBefore?: number) {
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
  const clock = useRef(new FluencyClock());
  /** The learner tapped the ball to send: the turn ends without the detector's silence. */
  const sentEarly = useRef(false);
  const paused = useRef(false);
  /** The tutor spoke while the pause sheet was open; say it again on resume. */
  const missedSpeech = useRef(false);
  /** Says a short line in the wait after a spoken turn; its lines load once the session starts. */
  const filler = useRef(createFillerPlayer());
  /** Set when the session starts; the lines load after the opening line, so they never delay it. */
  const fillerLanguage = useRef<string | null>(null);
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
        onTranscript: (text) => {
          filler.current.heard();
          dispatch({ type: "transcript", text });
        },
        onTutor: (result) => dispatch({ type: "tutor", result }),
        onSpeech: (wav) => {
          filler.current.cancel();
          dispatch({ type: "speech" });
          if (paused.current) {
            missedSpeech.current = true;
            return;
          }
          // Captions already show the line; if the browser blocks audio, ask for a tap.
          clock.current.tutorStarted(performance.now());
          void speaker.current
            ?.play(wav)
            .catch((error: unknown) => {
              if (error instanceof AudioBlockedError) dispatch({ type: "audio_blocked" });
            })
            .finally(() => {
              clock.current.tutorStopped(performance.now());
              // Stopped by the pause sheet: the wait until resume is not a pause before answering.
              if (paused.current) clock.current.interrupt();
              dispatch({ type: "playback_end" });
            });
        },
        onError: (code) => {
          // "busy" answers a message sent mid-request; that request, and its wait, go on.
          if (code !== "busy") filler.current.cancel();
          dispatch({ type: "failed", code });
          // The server closed the socket for a frame that was too big: reconnect quietly.
          if (code === "too_long") connectSocket(id, { kind: "nothing" });
        },
        onDone: () => {
          filler.current.cancel();
          const language = fillerLanguage.current;
          if (language) {
            fillerLanguage.current = null;
            const player = filler.current;
            // Best effort: without the lines the wait is just quiet.
            void api
              .fillerSpeech(language)
              .then((clips) => player.setClips(clips))
              .catch(() => {});
          }
          dispatch({ type: "done" });
        },
      });
      socket.current = ws;
    },
    [api, deps],
  );

  // Start: microphone first (no session is created if it is blocked), then the session, then the socket.
  useEffect(() => {
    let cancelled = false;
    ended.current = false;
    clock.current = new FluencyClock();
    const player = filler.current;
    void (async () => {
      try {
        const opened = await deps.openMicrophone({
          onSpeechStart: () => {
            clock.current.learnerStarted(performance.now());
            dispatch({ type: "speech_start" });
          },
          onTurn: (wav) => {
            clock.current.learnerEnded(performance.now(), {
              silenceMs: sentEarly.current ? 0 : DEFAULT_TURN_OPTIONS.endSilenceMs,
            });
            sentEarly.current = false;
            mic.current?.pause();
            dispatch({ type: "sent", request: "audio" });
            socket.current?.sendTurn(wav);
            player.arm(speaker.current);
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
        fillerLanguage.current = started.language;
        dispatch({ type: "started", sessionId: started.sessionId, message: started.message, goals: started.goals });
        if (confidenceBefore) void rateConfidence(api, started.sessionId, "before", confidenceBefore);
        connect(started.sessionId, { kind: "speak" });
      } catch {
        if (!cancelled) dispatch({ type: "failed", code: "start_failed" });
      }
    })();
    return () => {
      cancelled = true;
      player.cancel();
      player.setClips([]);
      fillerLanguage.current = null;
      mic.current?.stop();
      socket.current?.close();
      speaker.current?.close();
      mic.current = socket.current = speaker.current = null;
      // Leaving mid-session (back button): close it on the server, best effort.
      if (sessionId.current && !ended.current) {
        void api.endSession(sessionId.current, clock.current.timing()).catch(() => {});
      }
      sessionId.current = null;
    };
  }, [api, deps, mode, connect, attempt, confidenceBefore]);

  // The microphone listens only on the learner's turn (and not while typing), so it never hears the tutor.
  const listening = (state.phase === "listening" || state.phase === "hearing") && !typing;
  useEffect(() => {
    if (listening) mic.current?.resume();
    else mic.current?.pause();
    // Typing or pausing: the wait that follows is not a pause before speaking.
    if (typing || state.phase === "paused") clock.current.interrupt();
  }, [listening, typing, state.phase]);

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
    if (state.phase === "hearing") {
      sentEarly.current = true;
      if (!mic.current?.sendNow()) sentEarly.current = false;
    }
    else if (state.phase === "speaking") speaker.current?.stop();
  }, [state.phase]);

  /** Any tap on the screen: lets the browser play and record, and replays a line it blocked. */
  const unlock = useCallback(() => {
    speaker.current?.unlock();
    mic.current?.unlock();
    if (state.audioBlocked && state.turn.done && state.phase === "listening") repeatLast();
  }, [state.audioBlocked, state.turn.done, state.phase, repeatLast]);

  const pause = useCallback(() => {
    filler.current.cancel();
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
    filler.current.cancel();
    mic.current?.stop();
    socket.current?.close();
    speaker.current?.stop();
    mic.current = socket.current = null;
    if (!id) return dispatch({ type: "ended", summary: null });
    try {
      dispatch({ type: "ended", summary: await api.endSession(id, clock.current.timing()) });
    } catch {
      dispatch({ type: "ended", summary: null });
    }
  }, [api, state.sessionId]);

  /** The confidence check-out on the summary. Best effort: the summary does not wait for it. */
  const rateAfter = useCallback(
    (value: number) => {
      if (state.sessionId) void rateConfidence(api, state.sessionId, "after", value);
    },
    [api, state.sessionId],
  );

  /** "Keep going" on the tutor's stop-or-keep-going question: the conversation just goes on. */
  const keepGoing = useCallback(() => dispatch({ type: "keep_going" }), []);

  return { state, typing, setTyping, tapBall, unlock, pause, resume, repeatLast, sendText, retry, end, rateAfter, keepGoing };
}

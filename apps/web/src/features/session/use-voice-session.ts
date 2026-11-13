import { useCallback, useContext, useEffect, useReducer, useRef, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { ApiError, type Mode } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import { type Microphone, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { createFillerPlayer } from "@/lib/voice/filler-player";
import { readPauseMs } from "@/lib/voice/pause-setting";
import type { Speaker } from "@/lib/voice/speaker";
import type { VoiceSocket } from "@/lib/voice/voice-socket";
import { FluencyClock } from "./fluency-clock";
import { clearSavedSession, saveSession, takeSavedSession, TRANSIENT_ERRORS } from "./saved-session";
import { type FailureCode, initialSessionState, type Retry, sessionReducer, tutorSpeaking } from "./session-state";
import { useAutoRetry } from "./use-auto-retry";
import { useElapsedSeconds } from "./use-elapsed-seconds";
import { useSessionSync } from "./use-session-sync";
import { useTutorSpeech } from "./use-tutor-speech";
import { VoiceDepsContext } from "./voice-deps";

/** Failures that need the whole start again (no session was created yet). */
const START_FAILURES: FailureCode[] = ["mic_blocked", "mic_missing", "mic_busy", "mic_unsupported", "start_failed", "tutor_start_failed"];
/** Failures that need a new socket on the same session. */
const SOCKET_FAILURES: FailureCode[] = ["disconnected", "in_use"];
/** Expected along the way (no speech, a frame dropped while busy): nothing to report. */
const QUIET_ERRORS = new Set(["bad_audio", "busy", "too_long"]);

/** Why a session couldn't start or resume: the tutor (Claude) didn't answer, or the server couldn't be used. */
function startFailure(error: unknown): FailureCode {
  return error instanceof ApiError && error.kind === "tutor_unavailable" ? "tutor_start_failed" : "start_failed";
}

/** What to send once a (re)connected socket opens. */
type OnOpen = Retry | { kind: "nothing" };

/** Runs a live voice session: microphone → socket → tutor's voice, driven by sessionReducer. */
export function useVoiceSession(mode: Mode, missionId: string | null = null) {
  const api = useApi();
  const deps = useContext(VoiceDepsContext);
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [attempt, setAttempt] = useState(0);
  const [typing, setTyping] = useState(false);
  /** Automatic retries spent on the current turn; back to 0 once the server answers it. */
  const autoRetries = useRef(0);
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
  /** Picked up after a reload: the socket opens on the first "Resume", which is also the tap the browser needs. */
  const resumedPending = useRef(false);
  const [seconds, setSeconds] = useElapsedSeconds(state.sessionId !== null && state.phase !== "paused" && state.phase !== "ended");
  useEffect(() => {
    paused.current = state.phase === "paused";
  }, [state.phase]);

  const speech = useTutorSpeech({ speaker, clock, paused, dispatch });

  const connect = useCallback(
    function connectSocket(id: string, onOpen: OnOpen) {
      socket.current?.close();
      const ws = deps.openVoiceSocket(api.voiceUrl(id), {
        onOpen: () => {
          if (onOpen.kind === "speak") {
            speech.unmute();
            dispatch({ type: "sent", request: "speak" });
            ws.speakLast();
          } else if (onOpen.kind === "audio") {
            speech.unmute();
            dispatch({ type: "sent", request: "audio", audio: onOpen.audio });
            ws.sendTurn(onOpen.audio);
          } else if (onOpen.kind === "text") {
            speech.unmute();
            dispatch({ type: "sent", request: "text", text: onOpen.text });
            clock.current.typed();
            ws.sendText(onOpen.text);
          } else if (onOpen.kind === "listen") {
            // Nothing was pending: the reconnect alone was the fix.
            autoRetries.current = 0;
            dispatch({ type: "recover" });
          }
        },
        onTranscript: (text) => {
          // Each answer from the server ends a run of retries.
          autoRetries.current = 0;
          filler.current.heard();
          clock.current.learnerSaid(text);
          dispatch({ type: "transcript", text });
        },
        onTutor: (result) => {
          autoRetries.current = 0;
          dispatch({ type: "tutor", result });
        },
        onFollowUp: (result) => dispatch({ type: "followup", result }),
        onSpeech: (wav) => {
          autoRetries.current = 0;
          filler.current.cancel();
          if (paused.current) {
            dispatch({ type: "speech" });
            missedSpeech.current = true;
            return;
          }
          // A hint can follow the reply in the same turn: they play one after the other.
          speech.play(wav);
        },
        onError: (code, message) => {
          if (!QUIET_ERRORS.has(code)) reportError(new Error(message), { where: `voice socket (${code})` });
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
          // The server keeps the timing so far, so a session left open still has it when it is closed.
          void api.saveTiming(id, clock.current.timing()).catch(() => {});
        },
      });
      socket.current = ws;
    },
    [api, deps, speech],
  );

  // Start: microphone first (no session is created if it is blocked), then the session, then the socket.
  useEffect(() => {
    let cancelled = false;
    ended.current = false;
    clock.current = new FluencyClock();
    const player = filler.current;
    // The silence that ends a turn, as chosen in Settings; read once per session.
    const endSilenceMs = readPauseMs();
    void (async () => {
      try {
        const opened = await deps.openMicrophone({
          onSpeechStart: () => {
            clock.current.learnerStarted(performance.now());
            dispatch({ type: "speech_start" });
          },
          onTurn: (wav, turn) => {
            clock.current.learnerEnded(performance.now(), {
              silenceMs: sentEarly.current ? 0 : endSilenceMs,
              pausesMs: turn?.pausesMs,
            });
            sentEarly.current = false;
            mic.current?.pause();
            speech.unmute();
            // The recording stays in the turn until its transcript arrives, so a failure can send it again.
            dispatch({ type: "sent", request: "audio", audio: wav });
            socket.current?.sendTurn(wav);
            player.arm(speaker.current);
          },
          // The wait before answering counts from when the microphone hears again, not from when it was asked to.
          onListening: () => clock.current.listening(performance.now()),
          // Let go during the tutor's turn (see below); it could not be opened again.
          onUnavailable: (reason) => dispatch({ type: "failed", code: `mic_${reason}` }),
          // iOS plays the tutor quietly while the page holds the microphone.
        }, { endSilenceMs, releaseWhilePaused: true });
        if (cancelled) return opened.stop();
        opened.pause();
        mic.current = opened;
      } catch (error) {
        const reason = error instanceof MicrophoneUnavailableError ? error.reason : "blocked";
        if (!cancelled) dispatch({ type: "failed", code: `mic_${reason}` });
        return;
      }
      const saved = takeSavedSession(api);
      if (saved && (saved.mode !== mode || saved.missionId !== missionId)) {
        // Another category (or a mission's conversation instead of a free one) was asked for: close the old session, best effort.
        clearSavedSession();
        void api.endSession(saved.sessionId, saved.timing).catch(() => {});
      } else if (saved) {
        try {
          const resumed = await api.resumeSession(saved.sessionId);
          sessionId.current = resumed.sessionId;
          if (cancelled || ended.current) return;
          speaker.current = deps.createSpeaker();
          fillerLanguage.current = resumed.language;
          clock.current = FluencyClock.from(saved.timing);
          // Picked up again: the server counts it as active from now.
          void api.saveTiming(resumed.sessionId, saved.timing).catch(() => {});
          setSeconds(saved.elapsedSeconds);
          resumedPending.current = true;
          dispatch({
            type: "resumed",
            sessionId: resumed.sessionId,
            captions: resumed.turns.map((t) => ({ who: t.role === "user" ? "you" : "tutor", text: t.content })),
            goals: resumed.goals,
            coveredGoals: resumed.coveredGoals,
            hint: resumed.hint,
            track: resumed.track,
            scaffold: resumed.scaffold,
          });
          return;
        } catch (error) {
          // Offline or the server is down: try again later. Anything else (gone, ended, unreadable): start a new one.
          if (error instanceof ApiError && TRANSIENT_ERRORS.includes(error.kind)) {
            if (!cancelled) dispatch({ type: "failed", code: startFailure(error) });
            return;
          }
          clearSavedSession();
        }
      }
      try {
        const started = await api.startSession(mode, undefined, missionId ?? undefined);
        sessionId.current = started.sessionId;
        // The learner left or ended before the session existed: close it on the server too.
        if (cancelled || ended.current) return void api.endSession(started.sessionId).catch(() => {});
        speaker.current = deps.createSpeaker();
        fillerLanguage.current = started.language;
        saveSession({ sessionId: started.sessionId, mode, missionId, elapsedSeconds: 0, timing: clock.current.timing() });
        dispatch({
          type: "started",
          sessionId: started.sessionId,
          message: started.message,
          goals: started.goals,
          track: started.track,
          scaffold: started.scaffold,
        });
        connect(started.sessionId, { kind: "speak" });
      } catch (error) {
        if (!cancelled) dispatch({ type: "failed", code: startFailure(error) });
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
      // Leaving mid-session (back button): close it on the server, best effort. The mission's conversation
      // stays paused instead, to pick up later today: ending it would count step 3 as done.
      if (sessionId.current && !ended.current && !missionId) {
        clearSavedSession();
        void api.endSession(sessionId.current, clock.current.timing()).catch(() => {});
      }
      sessionId.current = null;
      resumedPending.current = false;
    };
  }, [api, deps, mode, missionId, connect, attempt, setSeconds, speech]);

  useSessionSync({ api, state, mode, missionId, seconds, clock, ended });

  // The microphone listens only on the learner's turn (and not while typing), so it never hears the tutor.
  const listening = (state.phase === "listening" || state.phase === "hearing") && !typing;
  // Only when `listening` flips: resuming drops what was heard, so doing it again when the learner starts
  // talking ("listening" → "hearing") would lose their turn and leave nothing to send.
  useEffect(() => {
    if (listening) mic.current?.resume();
    else mic.current?.pause();
  }, [listening]);
  // Typing or pausing: the wait that follows is not a pause before speaking.
  const interrupted = typing || state.phase === "paused";
  useEffect(() => {
    if (interrupted) clock.current.interrupt();
  }, [interrupted, state.phase]);

  const sendText = useCallback(
    (text: string) => {
      setTyping(false);
      speech.unmute();
      dispatch({ type: "sent", request: "text", text });
      clock.current.typed();
      socket.current?.sendText(text);
    },
    [speech],
  );

  /** Sends a recorded turn again (a retry): the learner does not have to say it twice. */
  const sendAudio = useCallback(
    (audio: ArrayBuffer) => {
      speech.unmute();
      dispatch({ type: "sent", request: "audio", audio });
      socket.current?.sendTurn(audio);
    },
    [speech],
  );

  const repeatLast = useCallback(() => {
    speech.stop();
    speech.unmute();
    dispatch({ type: "sent", request: "speak" });
    socket.current?.speakLast();
  }, [speech]);

  /** Tap the ball: send early while talking, interrupt the tutor while it speaks. */
  const tapBall = useCallback(() => {
    if (state.phase === "hearing") {
      sentEarly.current = true;
      if (!mic.current?.sendNow()) sentEarly.current = false;
    }
    else if (tutorSpeaking(state)) speech.silence();
  }, [state, speech]);

  /** Any tap on the screen: lets the browser play and record, and replays a line it blocked. */
  const unlock = useCallback(() => {
    speaker.current?.unlock();
    mic.current?.unlock();
    if (state.audioBlocked && state.turn.done && state.phase === "listening") repeatLast();
  }, [state.audioBlocked, state.turn.done, state.phase, repeatLast]);

  const pause = useCallback(() => {
    filler.current.cancel();
    speech.stop();
    dispatch({ type: "pause" });
  }, [speech]);

  const resume = useCallback(() => {
    dispatch({ type: "resume" });
    if (resumedPending.current && state.sessionId) {
      resumedPending.current = false;
      return connect(state.sessionId, { kind: "speak" });
    }
    if (missedSpeech.current && state.turn.done) {
      missedSpeech.current = false;
      repeatLast();
    }
  }, [state.turn.done, state.sessionId, repeatLast, connect]);

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
    if (next?.kind === "audio") return sendAudio(next.audio);
    if (next?.kind === "speak") return repeatLast();
    dispatch({ type: "recover" });
  }, [state, connect, sendText, sendAudio, repeatLast]);

  /** "Try again" on the failure card: a fresh round of automatic retries follows if it fails again. */
  const retryNow = useCallback(() => {
    autoRetries.current = 0;
    retry();
  }, [retry]);

  const autoRetry = useAutoRetry(state, retry, autoRetries);

  const end = useCallback(async () => {
    ended.current = true;
    clearSavedSession();
    const id = state.sessionId;
    dispatch({ type: "ending" });
    filler.current.cancel();
    mic.current?.stop();
    socket.current?.close();
    speech.stop();
    mic.current = socket.current = null;
    if (!id) return dispatch({ type: "ended", summary: null });
    try {
      dispatch({ type: "ended", summary: await api.endSession(id, clock.current.timing()) });
    } catch {
      dispatch({ type: "ended", summary: null });
    }
  }, [api, state.sessionId, speech]);

  /** "I said it right" on a hint card: the mistake no longer counts and the learner goes on; best effort. */
  const withdrawHint = useCallback(async () => {
    const id = state.sessionId;
    if (!id) return;
    try {
      await api.withdrawPending(id);
      dispatch({ type: "withdrawn" });
    } catch {
      // The hint stays: the learner can still retry the sentence.
    }
  }, [api, state.sessionId]);

  /** "Keep going" on the tutor's stop-or-keep-going question: the conversation just goes on. */
  const keepGoing = useCallback(() => dispatch({ type: "keep_going" }), []);

  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return {
    state,
    elapsed,
    typing,
    setTyping,
    tapBall,
    unlock,
    pause,
    resume,
    repeatLast,
    sendText,
    retry: retryNow,
    autoRetry,
    end,
    keepGoing,
    withdrawHint,
  };
}

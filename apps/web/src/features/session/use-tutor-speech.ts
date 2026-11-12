import { type ActionDispatch, type RefObject, useCallback, useMemo, useRef } from "react";
import { AudioBlockedError, type Speaker } from "@/lib/voice/speaker";
import type { FluencyClock } from "./fluency-clock";
import type { SessionAction } from "./session-state";

interface TutorSpeechDeps {
  speaker: RefObject<Speaker | null>;
  clock: RefObject<FluencyClock>;
  /** True while the pause sheet is open: what is left of the turn's speech is dropped. */
  paused: RefObject<boolean>;
  dispatch: ActionDispatch<[SessionAction]>;
}

/** The tutor's voice: plays its clips in order, and stays silent for the rest of a turn the learner stopped. */
export function useTutorSpeech({ speaker, clock, paused, dispatch }: TutorSpeechDeps) {
  /** The tutor's clips waiting to play, in order (a reply, then a hint about the learner's turn). */
  const queue = useRef<ArrayBuffer[]>([]);
  const playing = useRef(false);
  /** The learner stopped the tutor: the rest of this turn's speech (e.g. a hint still on its way) stays silent. */
  const muted = useRef(false);

  /** Plays the next clip; when none is left, the tutor's turn to speak is over. */
  const playNext = useCallback(
    function next() {
      const wav = queue.current.shift();
      if (!wav) {
        playing.current = false;
        dispatch({ type: "playback_end" });
        return;
      }
      playing.current = true;
      dispatch({ type: "voice_queued" });
      let started = false;
      // "Speaking" only once the voice is heard: waking the audio and decoding come first.
      const start = () => {
        if (started) return;
        started = true;
        dispatch({ type: "speech" });
        clock.current.tutorStarted(performance.now());
      };
      void (speaker.current ? speaker.current.play(wav, start) : Promise.resolve(start()))
        .catch((error: unknown) => {
          // Captions already show the line; if the browser blocks audio, ask for a tap.
          if (error instanceof AudioBlockedError) {
            start();
            dispatch({ type: "audio_blocked" });
          }
        })
        .finally(() => {
          if (started) clock.current.tutorStopped(performance.now());
          // Stopped by the pause sheet: the wait until resume is not a pause before answering.
          if (paused.current) {
            clock.current.interrupt();
            queue.current = [];
          }
          next();
        });
    },
    [speaker, clock, paused, dispatch],
  );

  /** One more clip of the tutor's voice: played after the ones before it, unless the learner stopped the tutor. */
  const play = useCallback(
    (wav: ArrayBuffer) => {
      if (muted.current) return;
      queue.current.push(wav);
      if (!playing.current) playNext();
    },
    [playNext],
  );

  /** Stops the tutor's voice, including the clips still waiting. */
  const stop = useCallback(() => {
    queue.current = [];
    speaker.current?.stop();
  }, [speaker]);

  /** The learner stopped the tutor: stops it, and keeps the rest of this turn's speech silent. */
  const silence = useCallback(() => {
    muted.current = true;
    stop();
  }, [stop]);

  /** A new request was sent: its speech plays. */
  const unmute = useCallback(() => {
    muted.current = false;
  }, []);

  return useMemo(() => ({ play, stop, silence, unmute }), [play, stop, silence, unmute]);
}

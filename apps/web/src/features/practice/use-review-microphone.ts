import { useContext, useEffect, useRef, useState } from "react";
import { VoiceDepsContext } from "@/features/session/voice-deps";
import type { Microphone } from "@/lib/voice/microphone";
import { readPauseMs } from "@/lib/voice/pause-setting";

/**
 * The microphone for a review: opened once, it makes turns only while listening for a cue (`listenFor`, its id), and stops on unmount.
 * `available` is null while opening and false when it can't be used (then the learner types).
 * `onTurn` also gets how long the learner took to start speaking that turn, from when the cue first showed.
 */
export function useReviewMicrophone(listenFor: string | null, onTurn: (wav: ArrayBuffer, startDelayMs: number | null) => void) {
  const listening = listenFor !== null;
  const { openMicrophone } = useContext(VoiceDepsContext);
  const [available, setAvailable] = useState<boolean | null>(null);
  // The cue the learner started speaking to: speech cut short by a pause must not show on the next cue.
  const [speakingTo, setSpeakingTo] = useState<string | null>(null);
  const cue = useRef(listenFor);
  const mic = useRef<Microphone | null>(null);
  const handler = useRef(onTurn);
  // When the current cue first showed, and when the learner started speaking in this turn.
  const timing = useRef<{ cue: string | null; listenedAt: number | null; spokeAt: number | null }>({ cue: null, listenedAt: null, spokeAt: null });
  useEffect(() => {
    handler.current = onTurn;
    if (listenFor !== null) cue.current = listenFor;
  }, [onTurn, listenFor]);
  useEffect(() => {
    // A new cue starts the clock, even while the microphone is still opening; listening again for the same cue
    // (after "not heard") keeps it.
    if (listenFor !== null && timing.current.cue !== listenFor) {
      timing.current = { cue: listenFor, listenedAt: performance.now(), spokeAt: null };
    }
  }, [listenFor]);

  useEffect(() => {
    let cancelled = false;
    openMicrophone(
      {
        onSpeechStart: () => {
          setSpeakingTo(cue.current);
          if (timing.current.spokeAt === null) timing.current.spokeAt = performance.now();
        },
        onTurn: (wav) => {
          setSpeakingTo(null);
          mic.current?.pause();
          const { cue: timed, listenedAt, spokeAt } = timing.current;
          const delay = timed === cue.current && listenedAt !== null && spokeAt !== null ? Math.round(spokeAt - listenedAt) : null;
          // Each turn is timed from its own speech: a cough or an unheard try must not time the real answer.
          timing.current.spokeAt = null;
          handler.current(wav, delay);
        },
      },
      { endSilenceMs: readPauseMs() },
    )
      .then((opened) => {
        if (cancelled) return opened.stop();
        opened.pause();
        mic.current = opened;
        setAvailable(true);
      })
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
      mic.current?.stop();
      mic.current = null;
    };
  }, [openMicrophone]);

  useEffect(() => {
    if (!available) return;
    if (listening) mic.current?.resume();
    else mic.current?.pause();
  }, [available, listening]);

  return { available, speaking: listening && speakingTo === listenFor, unlock: () => mic.current?.unlock() };
}

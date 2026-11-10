import { useContext, useEffect, useRef, useState } from "react";
import { VoiceDepsContext } from "@/features/session/voice-deps";
import type { Microphone } from "@/lib/voice/microphone";
import { readPauseMs } from "@/lib/voice/pause-setting";

/**
 * The microphone for a review: opened once, it makes turns only while listening for a cue (`listenFor`, its id), and stops on unmount.
 * `available` is null while opening and false when it can't be used (then the learner types).
 * `onTurn` also gets how long the learner took to start speaking, from the first time the cue was listened for.
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
  // When listening first started for the current cue, and when the learner first spoke to it.
  const timing = useRef<{ cue: string | null; listenedAt: number | null; spokeAt: number | null }>({ cue: null, listenedAt: null, spokeAt: null });
  useEffect(() => {
    handler.current = onTurn;
    if (listenFor !== null) cue.current = listenFor;
  }, [onTurn, listenFor]);

  useEffect(() => {
    let cancelled = false;
    openMicrophone(
      {
        onSpeechStart: () => {
          setSpeakingTo(cue.current);
          if (timing.current.cue === cue.current && timing.current.spokeAt === null) timing.current.spokeAt = performance.now();
        },
        onTurn: (wav) => {
          setSpeakingTo(null);
          mic.current?.pause();
          const { cue: timed, listenedAt, spokeAt } = timing.current;
          const delay = timed === cue.current && listenedAt !== null && spokeAt !== null ? Math.round(spokeAt - listenedAt) : null;
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
    if (listening) {
      // A new cue starts the clock; listening again for the same cue (after "not heard") keeps it.
      if (timing.current.cue !== listenFor) timing.current = { cue: listenFor, listenedAt: performance.now(), spokeAt: null };
      mic.current?.resume();
    } else mic.current?.pause();
  }, [available, listening, listenFor]);

  return { available, speaking: listening && speakingTo === listenFor, unlock: () => mic.current?.unlock() };
}

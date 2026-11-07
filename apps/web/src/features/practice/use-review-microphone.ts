import { useContext, useEffect, useRef, useState } from "react";
import { VoiceDepsContext } from "@/features/session/voice-deps";
import type { Microphone } from "@/lib/voice/microphone";
import { readPauseMs } from "@/lib/voice/pause-setting";

/**
 * The microphone for a review: opened once, it makes turns only while listening for a cue (`listenFor`, its id), and stops on unmount.
 * `available` is null while opening and false when it can't be used (then the learner types).
 */
export function useReviewMicrophone(listenFor: string | null, onTurn: (wav: ArrayBuffer) => void) {
  const listening = listenFor !== null;
  const { openMicrophone } = useContext(VoiceDepsContext);
  const [available, setAvailable] = useState<boolean | null>(null);
  // The cue the learner started speaking to: speech cut short by a pause must not show on the next cue.
  const [speakingTo, setSpeakingTo] = useState<string | null>(null);
  const cue = useRef(listenFor);
  const mic = useRef<Microphone | null>(null);
  const handler = useRef(onTurn);
  useEffect(() => {
    handler.current = onTurn;
    if (listenFor !== null) cue.current = listenFor;
  }, [onTurn, listenFor]);

  useEffect(() => {
    let cancelled = false;
    openMicrophone(
      {
        onSpeechStart: () => setSpeakingTo(cue.current),
        onTurn: (wav) => {
          setSpeakingTo(null);
          mic.current?.pause();
          handler.current(wav);
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

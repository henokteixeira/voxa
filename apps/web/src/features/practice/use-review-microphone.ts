import { useContext, useEffect, useRef, useState } from "react";
import { VoiceDepsContext } from "@/features/session/voice-deps";
import type { Microphone } from "@/lib/voice/microphone";
import { readPauseMs } from "@/lib/voice/pause-setting";

/**
 * The microphone for a review: opened once, it makes turns only while `listening`, and stops on unmount.
 * `available` is null while opening and false when it can't be used (then the learner types).
 */
export function useReviewMicrophone(listening: boolean, onTurn: (wav: ArrayBuffer) => void) {
  const { openMicrophone } = useContext(VoiceDepsContext);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const mic = useRef<Microphone | null>(null);
  const handler = useRef(onTurn);
  useEffect(() => {
    handler.current = onTurn;
  }, [onTurn]);

  useEffect(() => {
    let cancelled = false;
    openMicrophone(
      {
        onSpeechStart: () => setSpeaking(true),
        onTurn: (wav) => {
          setSpeaking(false);
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

  return { available, speaking: listening && speaking, unlock: () => mic.current?.unlock() };
}

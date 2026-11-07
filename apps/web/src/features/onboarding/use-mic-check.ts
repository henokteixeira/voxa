import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { VoiceDepsContext } from "@/features/session/voice-deps";
import { type Microphone, type MicrophoneError, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { readPauseMs } from "@/lib/voice/pause-setting";

/** idle: not started. listening: open, nobody talking. hearing: the learner is talking. heard: a full sentence came. */
export type MicCheck =
  | { status: "idle" | "opening" | "listening" | "hearing" | "heard" }
  | { status: "failed"; reason: MicrophoneError };

/**
 * Opens the microphone and waits for one spoken sentence, using the same turn detection as a session.
 * The microphone closes when the sentence arrives or when the component using this hook unmounts.
 */
export function useMicCheck() {
  const { openMicrophone } = useContext(VoiceDepsContext);
  const [check, setCheck] = useState<MicCheck>({ status: "idle" });
  const mic = useRef<Microphone | null>(null);
  const alive = useRef(true);

  const stop = useCallback(() => {
    mic.current?.stop();
    mic.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setCheck({ status: "opening" });
    try {
      // The same end-of-turn pause as the learner's sessions.
      const opened = await openMicrophone(
        {
          onSpeechStart: () => alive.current && setCheck({ status: "hearing" }),
          onTurn: () => {
            if (!alive.current) return;
            setCheck({ status: "heard" });
            stop();
          },
        },
        { endSilenceMs: readPauseMs() },
      );
      if (!alive.current) return opened.stop();
      mic.current = opened;
      opened.unlock();
      setCheck((current) => (current.status === "opening" ? { status: "listening" } : current));
    } catch (error) {
      if (!alive.current) return;
      setCheck({ status: "failed", reason: error instanceof MicrophoneUnavailableError ? error.reason : "blocked" });
    }
  }, [openMicrophone, stop]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);

  /** Lets the browser start audio; call from a tap. */
  const unlock = useCallback(() => mic.current?.unlock(), []);

  return { check, start, unlock };
}

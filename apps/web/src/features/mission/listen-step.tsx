import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { VoiceDepsContext } from "@/features/session/voice-deps";
import { useApi } from "@/hooks/use-api";
import type { MissionModel } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import type { Speaker } from "@/lib/voice/speaker";
import { MISSION_COPY } from "./mission-copy";

/**
 * Step 1: someone else does the same task first, at the learner's level. Audio first, the text on tap.
 * The step is done once the learner listened to it to the end (`onListened`); "Continue" then moves on.
 * If the audio can't play, Continue is offered too: the text is there to read.
 */
export function ListenStep(props: { missionId: string; model: MissionModel; onListened: () => void; onContinue: () => void }) {
  const { missionId, model } = props;
  const api = useApi();
  const copy = useCopy(MISSION_COPY);
  const { createSpeaker } = useContext(VoiceDepsContext);
  const speaker = useRef<Speaker | null>(null);
  const speech = useRef<Promise<ArrayBuffer> | null>(null);
  const [state, setState] = useState<"idle" | "playing" | "failed">("idle");
  const [listened, setListened] = useState(false);
  const [textShown, setTextShown] = useState(false);
  useEffect(() => () => speaker.current?.close(), []);

  async function play() {
    speaker.current ??= createSpeaker();
    speaker.current.unlock();
    setState("playing");
    try {
      speech.current ??= api.missionSpeech(missionId);
      await speaker.current.play(await speech.current);
      setState("idle");
      if (!listened) {
        setListened(true);
        props.onListened();
      }
    } catch {
      // The next tap loads the speech again.
      speech.current = null;
      setState("failed");
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-title">{copy.listenTitle(model.speaker)}</h1>
        <p className="m-0 text-caption text-taupe">{copy.listenHint(model.speaker)}</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <VoiceBall state={state === "playing" ? "speaking" : "idle"} size={180} />
        <span aria-live="polite" className="text-label text-mist-ink">
          {state === "playing" ? copy.listening : ""}
        </span>
      </div>
      {textShown && (
        <p lang="en" className="m-0 rounded-md bg-paper px-5 py-4 font-serif text-[18px] leading-relaxed shadow-card">
          {model.text}
        </p>
      )}
      {state === "failed" && (
        <p role="alert" className="m-0 text-center text-caption text-honey-ink">
          {copy.playFailed}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={textShown}
          onClick={() => setTextShown((shown) => !shown)}
          className="cursor-pointer self-center border-none bg-transparent p-0 text-small text-taupe underline-offset-4 hover:text-ink hover:underline"
        >
          {textShown ? copy.hideText : copy.showText}
        </button>
        {/* Without audio, reading the text is the way through: the step never blocks the mission. */}
        {listened || state === "failed" ? (
          <>
            <Button block variant="secondary" disabled={state === "playing"} onClick={() => void play()}>
              {listened ? copy.listenAgain : copy.listen}
            </Button>
            <Button block disabled={state === "playing"} onClick={props.onContinue}>
              {copy.continue}
            </Button>
          </>
        ) : (
          <Button block disabled={state === "playing"} onClick={() => void play()}>
            {copy.listen}
          </Button>
        )}
      </div>
    </>
  );
}

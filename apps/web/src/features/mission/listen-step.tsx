import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { VoiceDepsContext } from "@/features/session/voice-deps";
import { useApi } from "@/hooks/use-api";
import type { MissionModel } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import type { ClipPlayer } from "@/lib/voice/clip-player";
import { MISSION_COPY } from "./mission-copy";

/** How far "Back" goes: about one sentence of the model. */
const REWIND_SECONDS = 5;

/**
 * Step 1: someone else does the same task first, at the learner's level. Audio first, the text on tap.
 * While it plays, the learner can pause it and go back a few seconds to catch a sentence again.
 * The step is done once the learner listened to it to the end (`onListened`); "Continue" then moves on, and stops the audio.
 * If the audio can't play, Continue is offered too: the text is there to read.
 */
export function ListenStep(props: { missionId: string; model: MissionModel; onListened: () => void; onContinue: () => void }) {
  const { missionId, model } = props;
  const api = useApi();
  const copy = useCopy(MISSION_COPY);
  const { createClipPlayer } = useContext(VoiceDepsContext);
  const player = useRef<ClipPlayer | null>(null);
  const loaded = useRef(false);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused" | "failed">("idle");
  const [listened, setListened] = useState(false);
  const [textShown, setTextShown] = useState(false);
  // The clip ends outside React: read the latest callback, not the first render's.
  const onListened = useRef(props.onListened);
  useEffect(() => {
    onListened.current = props.onListened;
  });
  const listenedOnce = useRef(false);
  useEffect(() => () => player.current?.close(), []);

  function ended() {
    setState("idle");
    if (listenedOnce.current) return;
    listenedOnce.current = true;
    setListened(true);
    onListened.current();
  }

  async function play() {
    player.current ??= createClipPlayer(ended);
    player.current.unlock();
    setState(loaded.current ? "playing" : "loading");
    try {
      if (!loaded.current) {
        await player.current.load(await api.missionSpeech(missionId));
        loaded.current = true;
      }
      await player.current.play();
      setState("playing");
    } catch {
      // The next tap loads the speech again.
      loaded.current = false;
      setState("failed");
    }
  }

  function pause() {
    player.current?.pause();
    setState("paused");
  }

  const started = state === "playing" || state === "paused";
  const canContinue = listened || state === "failed";
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-title">{copy.listenTitle(model.speaker)}</h1>
        <p className="m-0 text-caption text-taupe">{copy.listenHint(model.speaker)}</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <VoiceBall state={state === "playing" ? "speaking" : "idle"} size={180} />
        <span aria-live="polite" className="text-label text-mist-ink">
          {state === "playing" ? copy.listening : state === "paused" ? copy.paused : ""}
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
        {started ? (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => player.current?.rewind(REWIND_SECONDS)}>
              <RewindIcon />
              {copy.rewind}
            </Button>
            {state === "playing" ? (
              <Button variant="secondary" className="flex-1" onClick={pause}>
                <PauseIcon />
                {copy.pause}
              </Button>
            ) : (
              <Button variant="secondary" className="flex-1" onClick={() => void play()}>
                <PlayIcon />
                {copy.resume}
              </Button>
            )}
          </div>
        ) : (
          <Button block variant={canContinue ? "secondary" : "primary"} disabled={state === "loading"} onClick={() => void play()}>
            {listened ? copy.listenAgain : copy.listen}
          </Button>
        )}
        {/* Without audio, reading the text is the way through: the step never blocks the mission. */}
        {canContinue && (
          <Button block onClick={props.onContinue}>
            {copy.continue}
          </Button>
        )}
      </div>
    </>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.4-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7Z" />
    </svg>
  );
}

function RewindIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v3.5h3.5" />
      <path d="M3.4 6.5A5.5 5.5 0 1 1 3 9.5" />
    </svg>
  );
}

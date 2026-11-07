import { useEffect, useRef } from "react";
import type { Cue } from "@/lib/sound/cues";
import { useSounds } from "@/lib/sound/sounds";
import type { SessionState } from "./session-state";

/** The cues one step of the session earns, from the state before it to the state after. */
export function cuesFor(before: SessionState, after: SessionState): Cue[] {
  // Picking a session up again (after a reload) restores its state: nothing new happened.
  if (before.phase === "starting") return [];
  const cues: Cue[] = [];
  if (after.phase === "listening" && (before.phase === "speaking" || before.phase === "thinking")) cues.push("yourTurn");
  if (before.phase === "hearing" && after.phase === "thinking") cues.push("turnSent");
  if (after.hintStep > before.hintStep) cues.push("hint");
  if (after.revealed && !before.revealed) cues.push("revealed");
  if (after.fixed && !before.fixed) cues.push("selfCorrected");
  if (after.coveredGoals.length > before.coveredGoals.length) cues.push("goalCovered");
  return cues;
}

/** Plays the session's sounds as it moves on. They wait while the tutor speaks, so they never cover the voice. */
export function useSessionCues(state: SessionState) {
  const { player } = useSounds();
  const previous = useRef(state);
  const speaking = state.phase === "speaking";
  // Before the cues below, so a cue from the step that ends the tutor's voice plays right away.
  useEffect(() => player.setVoiceActive(speaking), [player, speaking]);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before !== state) cuesFor(before, state).forEach((cue) => player.play(cue));
  }, [player, state]);
  // Leaving the screen mid-voice must not keep cues waiting for good.
  useEffect(() => () => player.setVoiceActive(false), [player]);
}

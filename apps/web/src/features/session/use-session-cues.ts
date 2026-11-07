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
  const typed = before.phase === "listening" && after.phase === "thinking" && after.turn.request === "text";
  if ((before.phase === "hearing" && after.phase === "thinking") || typed) cues.push("turnSent");
  // A new hint: the step moves, or a hint follows the correct form (the step starts again at 1).
  if (after.hintStep > 0 && (after.hintStep !== before.hintStep || (before.revealed && !after.revealed))) cues.push("hint");
  if (after.revealed && !before.revealed) cues.push("revealed");
  if (after.fixed && !before.fixed) cues.push("selfCorrected");
  if (after.coveredGoals.length > before.coveredGoals.length) cues.push("goalCovered");
  return cues;
}

/** Plays the session's sounds as it moves on. They wait while the tutor speaks, so they never cover the voice. */
export function useSessionCues(state: SessionState) {
  const { player } = useSounds();
  const previous = useRef(state);
  // The tutor's words arrive before its voice: from then until the turn is over, its voice is on or on its way.
  const voiceDue = state.phase === "speaking" || (state.phase === "thinking" && state.turn.tutor);
  const over = state.phase === "ending" || state.phase === "ended";
  // Before the cues below, so a cue from the step that ends the tutor's voice plays right away.
  useEffect(() => player.setVoiceActive(voiceDue), [player, voiceDue]);
  // A session that is over drops the cues still waiting: they belong to a screen that is gone.
  useEffect(() => {
    if (over) player.clear();
  }, [player, over]);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before !== state) cuesFor(before, state).forEach((cue) => player.play(cue));
  }, [player, state]);
  // Leaving the screen mid-voice: drop the waiting cues, and let later screens play theirs.
  useEffect(
    () => () => {
      player.clear();
      player.setVoiceActive(false);
    },
    [player],
  );
}

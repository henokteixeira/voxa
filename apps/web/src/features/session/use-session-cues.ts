import { useEffect, useRef, useState } from "react";
import type { XpToastTone } from "@/features/xp/xp-toast";
import type { XpReason } from "@/lib/api";
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

/** XP shown the moment it is earned. The session's XP is counted by the server when it ends. */
export interface XpMoment {
  reason: Extract<XpReason, "self_corrected" | "goal_covered">;
  tone: XpToastTone;
}

/** The XP a step earns on screen: fixing a mistake alone counts most, so it wins when both happen. */
export function xpMomentFor(before: SessionState, after: SessionState): XpMoment | null {
  if (before.phase === "starting") return null;
  if (after.fixed && !before.fixed) return { reason: "self_corrected", tone: "correction" };
  if (after.coveredGoals.length > before.coveredGoals.length) return { reason: "goal_covered", tone: "goal" };
  return null;
}

/** How long an XP toast stays. Matches the animation in index.css. */
export const XP_TOAST_MS = 1500;

/** Plays the session's sounds as it moves on and returns the XP toast to show, if any. Sounds never cover the tutor's voice. */
export function useSessionCues(state: SessionState) {
  const { player } = useSounds();
  const previous = useRef(state);
  const [toast, setToast] = useState<(XpMoment & { id: number }) | null>(null);
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
    if (before === state) return;
    cuesFor(before, state).forEach((cue) => player.play(cue));
    const moment = xpMomentFor(before, state);
    // One toast at a time: a new one replaces the last.
    if (moment) setToast((last) => ({ ...moment, id: (last?.id ?? 0) + 1 }));
  }, [player, state]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), XP_TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  // Leaving the screen mid-voice: drop the waiting cues, and let later screens play theirs.
  useEffect(
    () => () => {
      player.clear();
      player.setVoiceActive(false);
    },
    [player],
  );
  return toast;
}

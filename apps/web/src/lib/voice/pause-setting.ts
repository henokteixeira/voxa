import { DEFAULT_TURN_OPTIONS } from "./turn-detector";

/**
 * How long the learner can stay quiet before their turn is sent, chosen in Settings.
 * Kept on this device only: it depends on the learner and the room, not on the account.
 */
export const PAUSE_CHOICES_MS = [1500, 2500, 4000] as const;
export const PAUSE_STORAGE_KEY = "voxa.endSilenceMs";

function isChoice(value: number): boolean {
  return (PAUSE_CHOICES_MS as readonly number[]).includes(value);
}

export function readPauseMs(): number {
  try {
    const saved = Number(localStorage.getItem(PAUSE_STORAGE_KEY));
    return isChoice(saved) ? saved : DEFAULT_TURN_OPTIONS.endSilenceMs;
  } catch {
    return DEFAULT_TURN_OPTIONS.endSilenceMs; // storage blocked: fall back without failing
  }
}

export function savePauseMs(ms: number): void {
  try {
    localStorage.setItem(PAUSE_STORAGE_KEY, String(ms));
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
}

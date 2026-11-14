/**
 * Whether conversations at B2 follow the step-by-step script too (decided on 2026-11-14: optional at B2, off by
 * default; A1–B1 always follow it). Kept on this device only, like the sounds.
 */
export const GUIDED_B2_STORAGE_KEY = "voxa.guidedB2";

export function readGuidedAtB2(): boolean {
  try {
    return localStorage.getItem(GUIDED_B2_STORAGE_KEY) === "on";
  } catch {
    return false; // storage blocked: off, the default
  }
}

export function saveGuidedAtB2(on: boolean): void {
  try {
    localStorage.setItem(GUIDED_B2_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
}

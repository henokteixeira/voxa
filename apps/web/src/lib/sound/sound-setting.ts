/** Whether the app plays its sounds. Kept on this device only (a phone may need silence, the PC not). */
export const SOUNDS_STORAGE_KEY = "voxa.sounds";

export function readSoundsEnabled(): boolean {
  try {
    return localStorage.getItem(SOUNDS_STORAGE_KEY) !== "off";
  } catch {
    return true; // storage blocked: sounds stay on
  }
}

export function saveSoundsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUNDS_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
}

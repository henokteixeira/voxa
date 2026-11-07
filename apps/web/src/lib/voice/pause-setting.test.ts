import { describe, expect, it } from "vitest";
import {
  PAUSE_CHOICES_MS,
  PAUSE_STORAGE_KEY,
  readPauseMs,
  savePauseMs,
} from "./pause-setting";
import { DEFAULT_TURN_OPTIONS } from "./turn-detector";

describe("pause setting", () => {
  it("offers a short, the default and a long pause", () => {
    expect(PAUSE_CHOICES_MS).toEqual([1500, 2500, 4000]);
    expect(PAUSE_CHOICES_MS).toContain(DEFAULT_TURN_OPTIONS.endSilenceMs);
  });

  it("uses the default until the learner picks one", () => {
    expect(readPauseMs()).toBe(DEFAULT_TURN_OPTIONS.endSilenceMs);
  });

  it("remembers the learner's choice", () => {
    savePauseMs(4000);
    expect(readPauseMs()).toBe(4000);
  });

  it("ignores a stored value that is not one of the choices", () => {
    localStorage.setItem(PAUSE_STORAGE_KEY, "300");
    expect(readPauseMs()).toBe(DEFAULT_TURN_OPTIONS.endSilenceMs);
    localStorage.setItem(PAUSE_STORAGE_KEY, "abc");
    expect(readPauseMs()).toBe(DEFAULT_TURN_OPTIONS.endSilenceMs);
  });
});

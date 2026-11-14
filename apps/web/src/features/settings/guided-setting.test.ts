import { afterEach, describe, expect, it, vi } from "vitest";
import { GUIDED_B2_STORAGE_KEY, readGuidedAtB2, saveGuidedAtB2 } from "./guided-setting";

describe("the B2 step-by-step setting", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("is off by default and remembers the choice on this device", () => {
    expect(readGuidedAtB2()).toBe(false);
    saveGuidedAtB2(true);
    expect(localStorage.getItem(GUIDED_B2_STORAGE_KEY)).toBe("on");
    expect(readGuidedAtB2()).toBe(true);
    saveGuidedAtB2(false);
    expect(readGuidedAtB2()).toBe(false);
  });

  it("stays off when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readGuidedAtB2()).toBe(false);
    expect(() => saveGuidedAtB2(true)).not.toThrow();
  });
});

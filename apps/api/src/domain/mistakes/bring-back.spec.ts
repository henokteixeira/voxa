import { describe, expect, it } from "vitest";
import { patternsToBringBack } from "./bring-back.js";

describe("patternsToBringBack", () => {
  it("brings a pattern back once, 3 learner turns after it was last broken", () => {
    const patterns = [
      { key: "a", name: "A", lastTurn: 1 },
      { key: "b", name: "B", lastTurn: 2 },
    ];
    expect(patternsToBringBack(patterns, 3)).toEqual([]);
    expect(patternsToBringBack(patterns, 4)).toEqual([{ key: "a", name: "A" }]);
    expect(patternsToBringBack(patterns, 5)).toEqual([{ key: "b", name: "B" }]);
    expect(patternsToBringBack(patterns, 6)).toEqual([]);
  });
});

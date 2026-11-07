import { describe, expect, it } from "vitest";
import { patternsToBringBack } from "./bring-back.js";

describe("patternsToBringBack", () => {
  it("brings a pattern back 3 to 5 turns after it was last broken, the most recent first", () => {
    const patterns = [
      { key: "a", name: "A", lastTurn: 1 },
      { key: "b", name: "B", lastTurn: 2 },
      { key: "c", name: "C", lastTurn: 4 },
    ];
    expect(patternsToBringBack(patterns, 6)).toEqual([
      { key: "b", name: "B" },
      { key: "a", name: "A" },
    ]);
    expect(patternsToBringBack(patterns, 7).map((p) => p.key)).toEqual(["c", "b"]);
    expect(patternsToBringBack(patterns, 3)).toEqual([]);
  });
});

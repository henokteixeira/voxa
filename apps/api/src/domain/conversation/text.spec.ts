import { describe, expect, it } from "vitest";
import { samePhrase } from "./text.js";

describe("samePhrase", () => {
  it("matches an expression copied back with dots, without its ending or with a curly apostrophe", () => {
    for (const copy of ["I'm still working on...", "I’m still working on…", "i'm still working on", " I'm still working on… "]) {
      expect(samePhrase(copy, "I'm still working on…")).toBe(true);
    }
    expect(samePhrase("I'm working on…", "I'm still working on…")).toBe(false);
  });
});

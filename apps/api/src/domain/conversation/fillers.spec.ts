import { describe, expect, it } from "vitest";
import { fillerLinesFor } from "./fillers.js";

describe("fillerLinesFor", () => {
  it("matches on the primary subtag", () => {
    expect(fillerLinesFor("en-US")).toEqual(fillerLinesFor("en"));
    expect(fillerLinesFor("EN")).toHaveLength(5);
  });

  it("has no lines for a language without them", () => {
    expect(fillerLinesFor("fr")).toEqual([]);
  });
});

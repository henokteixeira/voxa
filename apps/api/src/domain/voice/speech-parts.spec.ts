import { describe, expect, it } from "vitest";
import { speechParts } from "./speech-parts.js";

describe("speechParts", () => {
  it("splits a line into sentences", () => {
    expect(speechParts("Nice, you fixed the login bug. What will you work on today? And how did the review go?")).toEqual([
      "Nice, you fixed the login bug.",
      "What will you work on today?",
      "And how did the review go?",
    ]);
  });

  it("keeps a short sentence with the next one, and a short last one with the one before", () => {
    expect(speechParts("OK. So what happened after the meeting? Then tell me what you decided. Great…  Really.")).toEqual([
      "OK. So what happened after the meeting?",
      "Then tell me what you decided. Great… Really.",
    ]);
  });

  it("keeps a line without a sentence end, or a short line, whole", () => {
    expect(speechParts("When did it happen")).toEqual(["When did it happen"]);
    expect(speechParts("  Hi!  ")).toEqual(["Hi!"]);
    expect(speechParts("")).toEqual([]);
  });

  it("does not split inside a number or after a period with no space", () => {
    expect(speechParts("It costs 2.50 dollars, which is fine by me.")).toEqual(["It costs 2.50 dollars, which is fine by me."]);
  });
});

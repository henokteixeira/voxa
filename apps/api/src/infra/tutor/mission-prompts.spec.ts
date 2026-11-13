import { describe, expect, it } from "vitest";
import { buildModelPrompt, MODEL_LEVELS } from "./mission-prompts.js";

describe("the mission's model", () => {
  it("is said in short parts, one per part of the task", () => {
    expect(buildModelPrompt("en")).toMatch(/in short parts, one for each part of the task, with a blank line between parts/);
  });

  it("stays short at B1, so the learner can keep it in mind", () => {
    expect(MODEL_LEVELS.supported).toMatch(/about 70 words/);
  });
});

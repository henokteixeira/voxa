import { describe, expect, it } from "vitest";
import { keptScaffold, sessionStep, STEP_WITHOUT_LEVEL, wasAssisted } from "./support.js";

describe("sessionStep", () => {
  it("follows the level, helps as before without one, and gives none in the placement interview", () => {
    expect(sessionStep("daily", "A1")).toBe("build_full");
    expect(sessionStep("review", "B1")).toBe("supported");
    expect(sessionStep("free_talk", null)).toBe(STEP_WITHOUT_LEVEL);
    expect(sessionStep("placement", "B1")).toBeNull();
  });
});

describe("keptScaffold", () => {
  it("keeps words to say only up to B1", () => {
    expect(keptScaffold("supported", " Yesterday I... ")).toBe("Yesterday I...");
    expect(keptScaffold("build_full", "I worked on the login screen.")).toBe("I worked on the login screen.");
    expect(keptScaffold("conversation", "Yesterday I...")).toBeNull();
    expect(keptScaffold(null, "Yesterday I...")).toBeNull();
    expect(keptScaffold("supported", "  ")).toBeNull();
  });
});

describe("wasAssisted", () => {
  it("counts words given by the tutor and the first language as help", () => {
    expect(wasAssisted({ scaffoldBefore: null, usedFirstLanguage: false })).toBe(false);
    expect(wasAssisted({ scaffoldBefore: "Yesterday I...", usedFirstLanguage: false })).toBe(true);
    expect(wasAssisted({ scaffoldBefore: null, usedFirstLanguage: true })).toBe(true);
  });
});

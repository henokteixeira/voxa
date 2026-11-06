import { describe, expect, it } from "vitest";
import { categoryLabel, seenAgo } from "./format";

describe("seenAgo", () => {
  const now = new Date("2026-11-06T00:30:00");
  it.each([
    ["2026-11-06T00:10:00", "today"],
    ["2026-11-05T23:50:00", "yesterday"],
    ["2026-11-03T12:00:00", "3 days ago"],
    ["2026-11-07T09:00:00", "today"],
  ])("%s is %s", (iso, label) => {
    expect(seenAgo(iso, now)).toBe(label);
  });

  it("speaks Portuguese", () => {
    expect(seenAgo("2026-11-03T12:00:00", now, "pt-BR")).toBe("há 3 dias");
    expect(seenAgo("2026-11-04T12:00:00", now, "pt-BR")).toBe("anteontem");
    expect(seenAgo("2026-11-05T23:50:00", now, "pt-BR")).toBe("ontem");
    expect(seenAgo("2026-11-06T00:10:00", now, "pt-BR")).toBe("hoje");
  });
});

describe("categoryLabel", () => {
  it("capitalizes and spaces the category", () => {
    expect(categoryLabel("grammar")).toBe("Grammar");
    expect(categoryLabel("word_choice")).toBe("Word choice");
  });

  it("names the known categories in Portuguese and keeps unknown ones readable", () => {
    expect(categoryLabel("grammar", "pt-BR")).toBe("Gramática");
    expect(categoryLabel("word_choice", "pt-BR")).toBe("Escolha de palavra");
    expect(categoryLabel("verb_tense", "pt-BR")).toBe("Verb tense");
  });
});

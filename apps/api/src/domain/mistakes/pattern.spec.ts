import { describe, expect, it } from "vitest";
import { cleanPattern } from "./pattern.js";

describe("cleanPattern", () => {
  it("turns the key into snake_case and trims the texts", () => {
    expect(cleanPattern({ key: " Past-Simple  Finished ", name: " Past for finished actions ", rule: " Ação\n terminada. " })).toEqual({
      key: "past_simple_finished",
      name: "Past for finished actions",
      rule: "Ação terminada.",
    });
  });

  it("drops accents and caps the key length", () => {
    expect(cleanPattern({ key: "préposição", name: "x", rule: "" })?.key).toBe("preposicao");
    expect(cleanPattern({ key: "a_".repeat(50), name: "x", rule: "" })?.key).toHaveLength(63);
  });

  it("is null without a usable key or name", () => {
    expect(cleanPattern(null)).toBeNull();
    expect(cleanPattern({ key: "!!", name: "Name", rule: "r" })).toBeNull();
    expect(cleanPattern({ key: "key", name: "  ", rule: "r" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { countLinkingWords } from "./linking-words.js";

describe("countLinkingWords", () => {
  it("counts the words that link ideas, ignoring case and punctuation", () => {
    expect(countLinkingWords("We chose Postgres because it is simple, but it was slow. So we added an index.", "en")).toBe(3);
    expect(countLinkingWords("Although it works, I'd change it if we had time.", "en")).toBe(2);
  });

  it("counts none in a list of plain sentences", () => {
    expect(countLinkingWords("I work at an NGO. I build apps. I like it.", "en")).toBe(0);
  });

  it("counts a regional English the same, and has no list for other languages", () => {
    expect(countLinkingWords("because", "en-GB")).toBe(1);
    expect(countLinkingWords("porque", "pt-BR")).toBeNull();
  });
});

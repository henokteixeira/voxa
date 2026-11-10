import { describe, expect, it } from "vitest";
import { countLinkingWords, linkingWordsPer100 } from "./linking-words.js";

describe("countLinkingWords", () => {
  it("counts the words that link ideas, ignoring case, punctuation and quotes", () => {
    expect(countLinkingWords("We chose Postgres because it is simple, BUT it was slow.", "en")).toBe(2);
    expect(countLinkingWords("Although it works, I'd change it if we had time.", "en")).toBe(2);
    expect(countLinkingWords("I left 'cause it rained, even though I liked it.", "en")).toBe(2);
  });

  it("does not count fillers, sequences or question words", () => {
    expect(countLinkingWords("So, um, so then I build apps, so cool. When? Which one?", "en")).toBe(0);
    expect(countLinkingWords("I work at an NGO. I build apps. I like it.", "en")).toBe(0);
  });

  it("counts a regional English the same, and has no list for other languages", () => {
    expect(countLinkingWords("because", "EN-us")).toBe(1);
    expect(countLinkingWords("porque", "pt-BR")).toBeNull();
  });
});

describe("linkingWordsPer100", () => {
  it("scales the count to how much was said", () => {
    expect(linkingWordsPer100("because but if", "en", 136)).toBe(2.2);
    expect(linkingWordsPer100("", "en", 0)).toBeNull();
    expect(linkingWordsPer100("porque", "pt-BR", 10)).toBeNull();
  });
});

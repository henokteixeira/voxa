import { describe, expect, it } from "vitest";
import { cleanMemory, MAX_FACT_LENGTH } from "./learner-fact.js";

describe("cleanMemory", () => {
  it("trims, drops empty, too long and repeated facts, and keeps only updates of known facts", () => {
    const memory = cleanMemory(
      {
        recap: "  Talked   about work. ",
        added: [
          { topic: "work", statement: " Works as a developer. " },
          { topic: "work", statement: "works as a developer." },
          { topic: "life", statement: "" },
          { topic: "life", statement: "x".repeat(MAX_FACT_LENGTH + 1) },
        ],
        updated: [
          { id: "known", statement: "Moved to the Voxa project." },
          { id: "unknown", statement: "Not a known fact." },
        ],
      },
      new Set(["known"]),
    );
    expect(memory).toEqual({
      recap: "Talked about work.",
      added: [{ topic: "work", statement: "Works as a developer." }],
      updated: [{ id: "known", statement: "Moved to the Voxa project." }],
    });
  });

  it("drops an empty or too long recap", () => {
    const empty = { added: [], updated: [] };
    expect(cleanMemory({ ...empty, recap: "  " }, new Set()).recap).toBeNull();
    expect(cleanMemory({ ...empty, recap: "x".repeat(MAX_FACT_LENGTH * 2 + 1) }, new Set()).recap).toBeNull();
  });
});

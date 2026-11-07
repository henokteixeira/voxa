import { describe, expect, it } from "vitest";
import type { BankEntry, DismissReason, MistakeBankRepository } from "../domain/ports/mistake-bank.repository.js";
import { MistakeBankService, MistakeNotFoundError } from "./mistake-bank.service.js";

const seen = new Date("2026-11-05T10:00:00Z");
const entry = (id: string, sessionsCorrect: number): BankEntry => ({
  id,
  language: "en",
  original: `said ${id}`,
  correction: `right ${id}`,
  category: "grammar",
  occurrences: 1,
  lastSeenAt: seen,
  sessionsCorrect,
  pattern: null,
});

class FakeBank implements MistakeBankRepository {
  dismissed: { id: string; reason: DismissReason }[] = [];
  constructor(private readonly entries: BankEntry[]) {}
  async list(language: string) {
    return this.entries.filter((e) => e.language === language);
  }
  async dismiss(id: string, reason: DismissReason) {
    if (!this.entries.some((e) => e.id === id)) return false;
    this.dismissed.push({ id, reason });
    return true;
  }
}

describe("MistakeBankService", () => {
  it("lists the bank with a status for each mistake, keeping the repository's order", async () => {
    const service = new MistakeBankService(
      new FakeBank([entry("a", 0), entry("b", 1), entry("c", 3)]),
    );
    expect(await service.list("en")).toEqual([
      { id: "a", language: "en", original: "said a", correction: "right a", category: "grammar", occurrences: 1, lastSeenAt: seen, status: "open", pattern: null },
      { id: "b", language: "en", original: "said b", correction: "right b", category: "grammar", occurrences: 1, lastSeenAt: seen, status: "improving", pattern: null },
      { id: "c", language: "en", original: "said c", correction: "right c", category: "grammar", occurrences: 1, lastSeenAt: seen, status: "mastered", pattern: null },
    ]);
  });

  it("dismisses a mistake with the learner's reason", async () => {
    const bank = new FakeBank([entry("a", 0)]);
    await new MistakeBankService(bank).dismiss("a", "transcript_error");
    expect(bank.dismissed).toEqual([{ id: "a", reason: "transcript_error" }]);
  });

  it("fails when the mistake does not exist", async () => {
    const service = new MistakeBankService(new FakeBank([]));
    await expect(service.dismiss("nope", "not_needed")).rejects.toBeInstanceOf(MistakeNotFoundError);
  });
});

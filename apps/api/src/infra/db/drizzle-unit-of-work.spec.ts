import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { DrizzleMistakeRepository } from "./drizzle-mistake.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { DrizzleUnitOfWork } from "./drizzle-unit-of-work.js";
import { mistakeOccurrences, mistakes } from "./schema.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let close: () => Promise<void>;
let unitOfWork: DrizzleUnitOfWork;
let sessions: DrizzleSessionRepository;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  unitOfWork = new DrizzleUnitOfWork(db);
  sessions = new DrizzleSessionRepository(db);
});
afterEach(() => close());

const goed = { language: "en", original: "I goed", correction: "I went", category: "verb_tense", pattern: null };

describe("DrizzleUnitOfWork", () => {
  it("keeps every write when the work succeeds", async () => {
    const { id } = await sessions.create({ language: "en", mode: "daily" });

    await unitOfWork.run(async (stores) => {
      await stores.mistakes.record(goed, { sessionId: id, severity: "serious", learnerTurn: 1 });
      await stores.sessions.appendTurn(id, { role: "user", content: "I goed" });
    });

    expect(await sessions.history(id)).toEqual([{ role: "user", content: "I goed" }]);
    expect(await new DrizzleMistakeRepository(db).forSession(id)).toHaveLength(1);
  });

  it("keeps nothing when the work fails halfway, including a mistake recorded in its own transaction", async () => {
    const { id } = await sessions.create({ language: "en", mode: "daily" });

    await expect(
      unitOfWork.run(async (stores) => {
        await stores.mistakes.record(goed, { sessionId: id, severity: "serious", learnerTurn: 1 });
        await stores.sessions.appendTurn(id, { role: "user", content: "I goed" });
        throw new Error("The turn could not be saved.");
      }),
    ).rejects.toThrow("The turn could not be saved.");

    expect(await sessions.history(id)).toEqual([]);
    expect(await db.select().from(mistakes)).toEqual([]);
    expect(await db.select().from(mistakeOccurrences)).toEqual([]);
  });
});

describe("DrizzleSessionRepository.claimTurn", () => {
  it("is true while the session has exactly the turns seen, false once another was saved", async () => {
    const { id } = await sessions.create({ language: "en", mode: "daily" });
    await sessions.appendTurn(id, { role: "assistant", content: "Hi." });

    expect(await unitOfWork.run((stores) => stores.sessions.claimTurn(id, 1))).toBe(true);
    await sessions.appendTurn(id, { role: "user", content: "Hello." });
    expect(await unitOfWork.run((stores) => stores.sessions.claimTurn(id, 1))).toBe(false);
  });
});

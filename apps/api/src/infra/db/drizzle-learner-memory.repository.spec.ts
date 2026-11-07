import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { DrizzleLearnerMemoryRepository } from "./drizzle-learner-memory.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let close: () => Promise<void>;
let memory: DrizzleLearnerMemoryRepository;
let sessions: DrizzleSessionRepository;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  memory = new DrizzleLearnerMemoryRepository(db);
  sessions = new DrizzleSessionRepository(db);
});
afterEach(() => close());

const at = new Date("2026-11-07T18:00:00Z");
const later = new Date("2026-11-08T18:00:00Z");

describe("DrizzleLearnerMemoryRepository", () => {
  it("saves a session's facts and recap once", async () => {
    const session = await sessions.create({ language: "en", mode: "free_talk" });
    expect(await memory.remembered(session.id)).toBe(false);

    const saved = await memory.save(
      session.id,
      "en",
      { recap: "Talked about a trip to Lisbon.", added: [{ topic: "life", statement: "Lives in Brazil." }], updated: [] },
      at,
    );

    expect(saved).toBe(true);
    expect(await memory.remembered(session.id)).toBe(true);
    expect(await memory.facts()).toEqual([
      expect.objectContaining({ topic: "life", statement: "Lives in Brazil.", language: "en", sourceSessionId: session.id, learnedAt: at }),
    ]);
    // A second save adds nothing.
    expect(await memory.save(session.id, "en", { recap: "Other.", added: [{ topic: "life", statement: "X." }], updated: [] }, at)).toBe(false);
    expect(await memory.facts()).toHaveLength(1);
  });

  it("lists ended sessions not remembered yet", async () => {
    const going = await sessions.create({ language: "en", mode: "daily" });
    const ended = await sessions.create({ language: "en", mode: "daily" });
    await sessions.end(ended.id, null);
    expect(await memory.unremembered(5)).toEqual([ended.id]);
    await memory.save(ended.id, "en", { recap: null, added: [], updated: [] }, at);
    expect(await memory.unremembered(5)).toEqual([]);
    expect(going.endedAt).toBeNull();
  });

  it("replaces a fact the learner changed, keeping when it was first learned", async () => {
    const first = await sessions.create({ language: "en", mode: "placement" });
    await memory.save(first.id, "en", { recap: null, added: [{ topic: "projects", statement: "Works on the Oral Collector app." }], updated: [] }, at);
    const [fact] = await memory.facts();

    const second = await sessions.create({ language: "en", mode: "daily" });
    await memory.save(second.id, "es", { recap: null, added: [], updated: [{ id: fact.id, statement: "Moved to the Voxa project." }] }, later);

    expect(await memory.facts()).toEqual([
      { ...fact, statement: "Moved to the Voxa project.", language: "es", sourceSessionId: second.id, updatedAt: later },
    ]);
  });

  it("recalls the newest sessions with a recap, newest first", async () => {
    const make = async (startedAt: string, recap: string | null) => {
      const s = await sessions.create({ language: "en", mode: "daily", startedAt: new Date(startedAt) });
      await memory.save(s.id, "en", { recap, added: [], updated: [] }, at);
    };
    await make("2026-11-05T10:00:00Z", "Planned the release.");
    await make("2026-11-06T10:00:00Z", null);
    await make("2026-11-07T10:00:00Z", "Talked about a bug in sync.");

    expect(await memory.recentSessions(3)).toEqual([
      { mode: "daily", language: "en", startedAt: new Date("2026-11-07T10:00:00Z"), recap: "Talked about a bug in sync." },
      { mode: "daily", language: "en", startedAt: new Date("2026-11-05T10:00:00Z"), recap: "Planned the release." },
    ]);
    expect(await memory.recentSessions(1)).toHaveLength(1);
  });
});

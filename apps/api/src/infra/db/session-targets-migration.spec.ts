import { rmSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { soleLearnerId } from "./learner.js";
import { MIGRATIONS, migrationsBefore } from "./migrations-before.js";
import * as schema from "./schema.js";

const TAG = "0034_session_targets";

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe(`migration ${TAG}`, () => {
  it("moves each session's targets to their own table, in order, keeping which were met", async () => {
    const before = migrationsBefore(TAG);
    const client = new PGlite();
    const db = drizzle(client, { schema });
    cleanup = async () => {
      await client.close();
      rmSync(before, { recursive: true, force: true });
    };
    await migrate(db, { migrationsFolder: before });
    const targets = [
      { original: "I goed", correction: "I went", category: "verb_tense" },
      { original: "He don't", correction: "He doesn't", category: "agreement" },
      { original: "I goed", correction: "I went", category: "verb_tense" },
    ];
    const [row] = (
      await db.execute<{ id: string }>(
        sql`insert into sessions (language, mode, targets, met_targets) values ('en', 'daily', ${JSON.stringify(targets)}::jsonb, '["He don''t"]'::jsonb) returning id`,
      )
    ).rows;

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const session = await new DrizzleSessionRepository(db, await soleLearnerId(db)).get(row!.id);
    // The repeated target is kept once.
    expect(session?.targets).toEqual(targets.slice(0, 2));
    expect(session?.metTargets).toEqual(["He don't"]);
  });
});

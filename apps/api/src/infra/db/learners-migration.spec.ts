import { rmSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { soleLearnerId } from "./learner.js";
import { MIGRATIONS, migrationsBefore } from "./migrations-before.js";
import * as schema from "./schema.js";

const TAG = "0035_learners";

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe(`migration ${TAG}`, () => {
  it("creates the one learner and gives them every record saved before", async () => {
    const before = migrationsBefore(TAG);
    const client = new PGlite();
    const db = drizzle(client, { schema });
    cleanup = async () => {
      await client.close();
      rmSync(before, { recursive: true, force: true });
    };
    await migrate(db, { migrationsFolder: before });
    await db.execute(sql`insert into sessions (language, mode) values ('en', 'daily')`);
    await db.execute(sql`insert into mistakes (language, original, correction, category) values ('en', 'I goed', 'I went', 'verb_tense')`);

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const learnerId = await soleLearnerId(db);
    expect(await db.select({ learnerId: schema.sessions.learnerId }).from(schema.sessions)).toEqual([{ learnerId }]);
    expect(await db.select({ learnerId: schema.mistakes.learnerId }).from(schema.mistakes)).toEqual([{ learnerId }]);
  });
});

describe("soleLearnerId", () => {
  it("refuses a second learner until login exists", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    cleanup = () => client.close();
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await db.insert(schema.learners).values({});

    await expect(soleLearnerId(db)).rejects.toThrow("Expected exactly one learner");
  });
});

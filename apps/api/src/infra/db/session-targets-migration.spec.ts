import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import * as schema from "./schema.js";

const MIGRATIONS = resolve(__dirname, "../../../drizzle");
const TAG = "0034_session_targets";

/** The migrations folder as it was before `tag`. */
function migrationsBefore(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), "voxa-migrations-"));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const at = journal.entries.findIndex((entry) => entry.tag === tag);
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
  return dir;
}

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

    const session = await new DrizzleSessionRepository(db).get(row!.id);
    // The repeated target is kept once.
    expect(session?.targets).toEqual(targets.slice(0, 2));
    expect(session?.metTargets).toEqual(["He don't"]);
  });
});

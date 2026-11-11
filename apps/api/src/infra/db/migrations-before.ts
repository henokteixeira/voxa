import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** The real migrations folder. */
export const MIGRATIONS = resolve(__dirname, "../../../drizzle");

/** A copy of the migrations folder as it was before `tag`, to test a migration on rows saved before it. For tests only. */
export function migrationsBefore(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), "voxa-migrations-"));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const at = journal.entries.findIndex((entry) => entry.tag === tag);
  if (at < 0) throw new Error(`No migration ${tag}`);
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
  return dir;
}

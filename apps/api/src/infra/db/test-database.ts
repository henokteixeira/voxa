import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./db.module.js";
import * as schema from "./schema.js";

/** An in-memory Postgres with every migration applied. For tests only. */
export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, "../../../drizzle") });
  return { db, close: () => client.close() };
}

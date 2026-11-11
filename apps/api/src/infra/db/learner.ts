import type { Database } from "./db.module.js";
import { learners } from "./schema.js";

/** The id of the learner the API serves (a string): the repositories save and read that learner's records. */
export const LEARNER_ID = Symbol("LEARNER_ID");

/**
 * The only learner. Until login exists there is exactly one: the migration that added learners created it and
 * gave it every record saved before.
 */
export async function soleLearnerId(db: Database): Promise<string> {
  const rows = await db.select({ id: learners.id }).from(learners).limit(2);
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one learner until login exists, found ${rows.length === 0 ? "none" : "more"}.`);
  }
  return rows[0].id;
}

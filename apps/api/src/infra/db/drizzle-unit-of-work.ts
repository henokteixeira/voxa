import { Inject, Injectable } from "@nestjs/common";
import type { TransactionStores, UnitOfWork } from "../../domain/ports/unit-of-work.port.js";
import { DATABASE, type Database } from "./db.module.js";
import { DrizzleMistakeRepository } from "./drizzle-mistake.repository.js";
import { DrizzleReviewRepository } from "./drizzle-review.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { LEARNER_ID } from "./learner.js";

/**
 * One Postgres transaction, with the repositories bound to it. A repository that opens its own transaction
 * inside (e.g. recording a mistake) gets a savepoint, so it still commits or rolls back with the whole.
 */
@Injectable()
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARNER_ID) private readonly learnerId: string,
  ) {}

  run<T>(work: (stores: TransactionStores) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => {
      // A transaction is a database handle too: the repositories run on it unchanged.
      const db = tx as unknown as Database;
      return work({
        sessions: new DrizzleSessionRepository(db, this.learnerId),
        mistakes: new DrizzleMistakeRepository(db, this.learnerId),
        reviews: new DrizzleReviewRepository(db, this.learnerId),
      });
    });
  }
}

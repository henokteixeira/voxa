import type { MistakeRepository } from "./mistake.repository.js";
import type { ReviewRepository } from "./review.repository.js";
import type { SessionRepository } from "./session.repository.js";

/** The repositories one transaction writes through. */
export interface TransactionStores {
  sessions: SessionRepository;
  mistakes: MistakeRepository;
  reviews: ReviewRepository;
}

/** Runs several writes as one: either all of them are saved, or none. Implementations live in infra/. */
export interface UnitOfWork {
  /** Runs `work` in one transaction. When it throws, nothing it wrote is kept and the error is passed on. */
  run<T>(work: (stores: TransactionStores) => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol("UNIT_OF_WORK");

import { Inject, Injectable } from "@nestjs/common";
import { mistakeStatus, type MistakeStatus } from "../domain/mistakes/mistake-status.js";
import {
  MISTAKE_BANK_REPOSITORY,
  type DismissReason,
  type MistakeBankRepository,
} from "../domain/ports/mistake-bank.repository.js";

export class MistakeNotFoundError extends Error {}

/** One mistake as the Mistakes screen shows it. */
export interface MistakeView {
  id: string;
  language: string;
  original: string;
  correction: string;
  category: string;
  occurrences: number;
  lastSeenAt: Date;
  status: MistakeStatus;
}

@Injectable()
export class MistakeBankService {
  constructor(@Inject(MISTAKE_BANK_REPOSITORY) private readonly bank: MistakeBankRepository) {}

  async list(language: string): Promise<MistakeView[]> {
    const entries = await this.bank.list(language);
    return entries.map(({ id, language, original, correction, category, occurrences, lastSeenAt, fixedByLearner, sessionsSince }) => ({
      id,
      language,
      original,
      correction,
      category,
      occurrences,
      lastSeenAt,
      status: mistakeStatus({ fixedByLearner, sessionsSince }),
    }));
  }

  async dismiss(id: string, reason: DismissReason): Promise<void> {
    if (!(await this.bank.dismiss(id, reason))) throw new MistakeNotFoundError(id);
  }
}

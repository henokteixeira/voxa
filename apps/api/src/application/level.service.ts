import { Inject, Injectable } from "@nestjs/common";
import {
  type CefrLevel,
  placementDue,
  type SpeakingLevel,
  type SupportStep,
  supportStepFor,
} from "../domain/level/speaking-level.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { LEVEL_REPOSITORY, type LevelRepository } from "../domain/ports/level.repository.js";

/** The level as the Progress tab shows it. */
export interface LevelView {
  /** Null before the first placement (or a level set by hand). */
  current: (SpeakingLevel & { step: SupportStep }) | null;
  /** Suggest a placement session: never placed, or the last one is 4 weeks old. */
  placementDue: boolean;
}

@Injectable()
export class LevelService {
  constructor(
    @Inject(LEVEL_REPOSITORY) private readonly levels: LevelRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async view(language: string): Promise<LevelView> {
    const [current, lastPlacementAt] = await Promise.all([
      this.levels.current(language),
      this.levels.lastPlacementAt(language),
    ]);
    return {
      current: current && { ...current, step: supportStepFor(current.level) },
      placementDue: placementDue(lastPlacementAt, this.clock.now()),
    };
  }

  /** The learner corrects the estimate by hand. */
  async setByHand(language: string, level: CefrLevel): Promise<LevelView> {
    await this.levels.add({ language, level, source: "manual", evidence: [], assessedAt: this.clock.now() });
    return this.view(language);
  }
}

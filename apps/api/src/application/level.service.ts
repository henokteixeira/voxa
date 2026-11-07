import { Inject, Injectable } from "@nestjs/common";
import {
  type CefrLevel,
  placementDue,
  type SpeakingLevel,
  type SupportStep,
  supportStepFor,
} from "../domain/level/speaking-level.js";
import { proposeStepChange, type StepChangeProposal } from "../domain/level/step-change.js";
import { InvalidInputError } from "../domain/errors.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { LEVEL_REPOSITORY, type LevelRepository } from "../domain/ports/level.repository.js";
import { SIGNALS_REPOSITORY, type SignalsRepository } from "../domain/ports/signals.repository.js";

/** How many recent sessions are read to find a step change; the rule needs only the last few. */
const STEP_CHANGE_LOOKBACK = 12;

/** The level as the Progress tab shows it. */
export interface LevelView {
  /** Null before the first placement (or a level set by hand). */
  current: (SpeakingLevel & { step: SupportStep }) | null;
  /** Suggest a placement session: never placed, or the last one is 4 weeks old. */
  placementDue: boolean;
  /** A different support step the sessions since the current level point to; the learner confirms it. */
  proposal: ProposalView | null;
}

/** The proposal, with the newest session it rests on: a new session makes it a new proposal for the app. */
export interface ProposalView extends StepChangeProposal {
  basedOn: string;
}

@Injectable()
export class LevelService {
  constructor(
    @Inject(LEVEL_REPOSITORY) private readonly levels: LevelRepository,
    @Inject(SIGNALS_REPOSITORY) private readonly signals: SignalsRepository,
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
      proposal: current && (await this.proposal(current)),
    };
  }

  /** The learner confirms the proposed step change; `to` must still be what is proposed. */
  async confirmStepChange(language: string, to: CefrLevel): Promise<LevelView> {
    const current = await this.levels.current(language);
    const proposal = current && (await this.proposal(current));
    if (proposal?.to !== to) throw new InvalidInputError(`No step change to ${to} is proposed right now.`);
    await this.levels.add({ language, level: to, source: "step_change", evidence: [], assessedAt: this.clock.now() });
    return this.view(language);
  }

  /** Only sessions since the current level count: older ones were practiced at another step. */
  private async proposal(current: SpeakingLevel): Promise<ProposalView | null> {
    const recent = await this.signals.recent(current.language, STEP_CHANGE_LOOKBACK);
    const since = recent.filter((record) => record.recordedAt >= current.assessedAt);
    const proposal = proposeStepChange(
      current.level,
      since.map((record) => record.signals),
    );
    const newest = since.find((record) => record.signals.unaidedShare !== null);
    return proposal && newest ? { ...proposal, basedOn: newest.sessionId } : null;
  }

  /** The learner corrects the estimate by hand. */
  async setByHand(language: string, level: CefrLevel): Promise<LevelView> {
    await this.levels.add({ language, level, source: "manual", evidence: [], assessedAt: this.clock.now() });
    return this.view(language);
  }
}

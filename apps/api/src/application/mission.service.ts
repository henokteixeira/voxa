import { Inject, Injectable } from "@nestjs/common";
import { sessionStep, STEP_WITHOUT_LEVEL } from "../domain/conversation/support.js";
import { DomainError } from "../domain/errors.js";
import { type Mission, type MissionModel, type MissionSituation, nextSituation } from "../domain/mission/mission.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { LEARNER_CONTEXT_PORT, type LearnerContextPort } from "../domain/ports/learner-context.port.js";
import { LEVEL_REPOSITORY, type LevelRepository } from "../domain/ports/level.repository.js";
import { MISSION_COACH_PORT, type MissionCoachPort } from "../domain/ports/mission-coach.port.js";
import { MISSION_REPOSITORY, type MissionRepository } from "../domain/ports/mission.repository.js";
import { TTS_PORT, type TextToSpeechPort } from "../domain/ports/voice.port.js";
import { localDay } from "../domain/progress/daily-goal.js";

export class MissionNotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(id: string) {
    super(`Mission ${id} not found.`, "Mission not found.");
  }
}

/** The day's mission as the web app shows it. */
export interface MissionView {
  id: string;
  language: string;
  day: string;
  situation: MissionSituation;
}

/** The daily mission: the day's situation (by rotation) and step 1's model with its 3 expressions. */
@Injectable()
export class MissionService {
  constructor(
    @Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository,
    @Inject(MISSION_COACH_PORT) private readonly coach: MissionCoachPort,
    @Inject(LEVEL_REPOSITORY) private readonly levels: LevelRepository,
    @Inject(LEARNER_CONTEXT_PORT) private readonly learnerContext: LearnerContextPort,
    @Inject(TTS_PORT) private readonly tts: TextToSpeechPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The mission of the learner's local day; the first request of a day creates it with the next situation. */
  async today(language: string, timeZone: string): Promise<MissionView> {
    const now = this.clock.now();
    const day = localDay(now, timeZone);
    const existing = await this.missions.forDay(language, day);
    if (existing) return view(existing);
    const last = await this.missions.latestBefore(language, day);
    return view(await this.missions.create({ language, day, situation: nextSituation(last?.situation ?? null), createdAt: now }));
  }

  /** Step 1's model, written at the learner's level the first time it is asked for, then kept. */
  async model(id: string): Promise<MissionModel> {
    const mission = await this.mission(id);
    if (mission.model) return mission.model;
    const [level, learnerContext] = await Promise.all([this.levels.current(mission.language), this.learnerContext.load()]);
    const step = sessionStep(mission.situation, level?.level ?? null) ?? STEP_WITHOUT_LEVEL;
    const model = await this.coach.model({ situation: mission.situation, language: mission.language, step, learnerContext });
    return this.missions.saveModel(id, model);
  }

  /** The model as speech (WAV). */
  async modelSpeech(id: string): Promise<Buffer> {
    const [mission, model] = await Promise.all([this.mission(id), this.model(id)]);
    return this.tts.synthesize(model.text, mission.language);
  }

  private async mission(id: string): Promise<Mission> {
    const mission = await this.missions.get(id);
    if (!mission) throw new MissionNotFoundError(id);
    return mission;
  }
}

const view = ({ id, language, day, situation }: Mission): MissionView => ({ id, language, day, situation });

import { Inject, Injectable } from "@nestjs/common";
import { sessionStep, STEP_WITHOUT_LEVEL } from "../domain/conversation/support.js";
import { InvalidInputError } from "../domain/errors.js";
import { MissionExpressionNotFoundError, MissionNotFoundError } from "../domain/mission/mission-errors.js";
import { checkInDueAt } from "../domain/check-in/check-in.js";
import {
  type MarkedStep,
  type Mission,
  type MissionModel,
  type MissionSituation,
  type MissionSteps,
  missionDone,
  missionSteps,
  nextSituation,
} from "../domain/mission/mission.js";
import { CHECK_IN_REPOSITORY, type CheckInRepository } from "../domain/ports/check-in.repository.js";
import { FASTER_ROUND_REPOSITORY, type FasterRoundRepository } from "../domain/ports/faster-round.repository.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { LEARNER_CONTEXT_PORT, type LearnerContextPort } from "../domain/ports/learner-context.port.js";
import { LEVEL_REPOSITORY, type LevelRepository } from "../domain/ports/level.repository.js";
import { MISSION_COACH_PORT, type MissionCoachPort } from "../domain/ports/mission-coach.port.js";
import { MISSION_REPOSITORY, type MissionRepository } from "../domain/ports/mission.repository.js";
import { TTS_PORT, type TextToSpeechPort } from "../domain/ports/voice.port.js";
import { localDay } from "../domain/progress/daily-goal.js";
import { ReviewScheduler } from "./review-scheduler.js";

export { MissionExpressionNotFoundError, MissionNotFoundError };

/** The day's mission as the web app shows it. */
export interface MissionView {
  id: string;
  language: string;
  day: string;
  situation: MissionSituation;
  steps: MissionSteps;
  /** Every step of the day is done. */
  done: boolean;
  /** Step 3's conversation, once started (step 4 retells it). */
  sessionId: string | null;
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
    private readonly reviews: ReviewScheduler,
    @Inject(SESSION_REPOSITORY) private readonly sessions: Pick<SessionRepository, "latestForMission">,
    @Inject(FASTER_ROUND_REPOSITORY) private readonly fasterRounds: Pick<FasterRoundRepository, "list">,
    @Inject(CHECK_IN_REPOSITORY) private readonly checkIns: Pick<CheckInRepository, "list">,
  ) {}

  /** The mission of the learner's local day; the first request of a day creates it with the next situation. */
  async today(language: string, timeZone: string): Promise<MissionView> {
    const now = this.clock.now();
    const day = localDay(now, timeZone);
    const existing = await this.missions.forDay(language, day);
    if (existing) return this.view(existing, timeZone);
    const last = await this.missions.latestBefore(language, day);
    const created = await this.missions.create({ language, day, situation: nextSituation(last?.situation ?? null), createdAt: now });
    return this.view(created, timeZone);
  }

  /** Marks step 1 (listened once), step 2 (the 3 expressions tried) or step 5 (the review) done. */
  async markStep(id: string, step: MarkedStep, timeZone: string): Promise<MissionView> {
    const mission = await this.mission(id);
    if (step === "expressions" && !mission.model) throw new InvalidInputError("Step 2 comes after the model.");
    await this.missions.markStep(id, step, this.clock.now());
    return this.view(await this.mission(id), timeZone);
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

  /**
   * Step 2: whether the learner's sentence used the expression (no hint, no correction). The first time it is used,
   * the expression joins the spaced review.
   */
  async say(id: string, expressionId: string, utterance: string): Promise<{ used: boolean }> {
    const mission = await this.mission(id);
    const expression = mission.model?.expressions.find((e) => e.id === expressionId);
    if (!expression) throw new MissionExpressionNotFoundError(id, expressionId);
    const said = utterance.trim();
    if (!said) throw new InvalidInputError("The sentence is empty.");
    const used = await this.coach.usedExpression(mission.language, expression, said);
    if (used) {
      const now = this.clock.now();
      await this.missions.markSaid(expressionId, now);
      // Always asked (it schedules only once): a failure after marking it said is mended by the next use.
      await this.reviews.learned(mission.language, { kind: "expression", id: expressionId }, now);
    }
    return { used };
  }

  private async view(mission: Mission, timeZone: string): Promise<MissionView> {
    const { id, language, day, situation } = mission;
    const [[last], session] = await Promise.all([this.checkIns.list(language, 1), this.sessions.latestForMission(id)]);
    const sessionId = session?.id ?? null;
    const rounds = sessionId ? await this.fasterRounds.list(sessionId) : [];
    const now = this.clock.now();
    // Step 0 belongs to the whole day the check-in falls due on, not only from its hour on.
    const doneToday = last ? localDay(last.recordedAt, timeZone) === day : false;
    const checkIn = { due: !doneToday && localDay(checkInDueAt(last?.recordedAt ?? null, now), timeZone) <= day, doneToday };
    const steps = missionSteps(mission, { checkIn, taskEnded: Boolean(session?.endedAt), fasterRounds: rounds.length });
    return { id, language, day, situation, steps, done: missionDone(steps), sessionId };
  }

  private async mission(id: string): Promise<Mission> {
    const mission = await this.missions.get(id);
    if (!mission) throw new MissionNotFoundError(id);
    return mission;
  }
}



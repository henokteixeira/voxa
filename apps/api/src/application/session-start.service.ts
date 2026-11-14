import { Inject, Injectable } from "@nestjs/common";
import { givesWords, openingPlan, startTrack, type TrackView, trackView } from "../domain/conversation/guided-track.js";
import { correctsMistakes, type Mode } from "../domain/conversation/mode.js";
import { describeGoal, goalsFor } from "../domain/conversation/session-goals.js";
import { sessionStep } from "../domain/conversation/support.js";
import type { ChatTurn, Session } from "../domain/conversation/types.js";
import { shownRule } from "../domain/conversation/text.js";
import { choosePracticeTargets } from "../domain/conversation/practice-targets.js";
import { InvalidInputError } from "../domain/errors.js";
import type { Mission } from "../domain/mission/mission.js";
import { MissionNotFoundError } from "../domain/mission/mission-errors.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { LEARNER_CONTEXT_PORT, type LearnerContextPort } from "../domain/ports/learner-context.port.js";
import { LEVEL_REPOSITORY, type LevelRepository } from "../domain/ports/level.repository.js";
import { MISSION_REPOSITORY, type MissionRepository } from "../domain/ports/mission.repository.js";
import { MISTAKE_BANK_REPOSITORY, type MistakeBankRepository } from "../domain/ports/mistake-bank.repository.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";
import { TUTOR_PORT, type TutorPort } from "../domain/ports/tutor.port.js";
import { LearnerMemoryService } from "./learner-memory.service.js";
import { ReviewScheduler } from "./review-scheduler.js";
import { openSession, phrasesOf, tutorContext } from "./session-context.js";

export interface SessionStart {
  session: Session;
  message: string;
  goals: readonly string[];
}

/** What the app needs to pick an open session up again, e.g. after the page reloads. */
export interface SessionResume {
  sessionId: string;
  mode: Mode;
  language: string;
  startedAt: Date;
  /** The conversation so far, in order. */
  turns: ChatTurn[];
  goals: readonly string[];
  coveredGoals: string[];
  /** The serious mistake the conversation is paused on, without its correction (the hints must not give it away). */
  hint: {
    hintsGiven: number;
    revealed: boolean;
    mistake: string;
    mistakeType: string;
    /** The rule it breaks, when it does not give the correct form away (see shownRule). */
    rule: { name: string; rule: string } | null;
  } | null;
  track: TrackView | null;
  scaffold: string | null;
  keyWords: string[];
}

/** Starts a session with the tutor's opening line, and picks an open one up again. */
@Injectable()
export class SessionStartService {
  constructor(
    @Inject(TUTOR_PORT) private readonly tutor: Pick<TutorPort, "open">,
    @Inject(SESSION_REPOSITORY) private readonly sessions: Pick<SessionRepository, "create" | "get" | "appendTurn" | "setProgress" | "history">,
    @Inject(LEARNER_CONTEXT_PORT) private readonly learnerContext: LearnerContextPort,
    @Inject(MISTAKE_BANK_REPOSITORY) private readonly bank: Pick<MistakeBankRepository, "list">,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LEVEL_REPOSITORY) private readonly levels: Pick<LevelRepository, "current">,
    private readonly reviews: ReviewScheduler,
    // The class itself (not a Pick): Nest injects by the parameter's runtime type.
    private readonly memory: LearnerMemoryService,
    @Inject(MISSION_REPOSITORY) private readonly missions: Pick<MissionRepository, "get">,
  ) {}

  /** Starts a session; with `missionId`, it is that daily mission's step 3, with the model's 3 expressions to invite. */
  async start(mode: Mode, language: string, missionId?: string): Promise<SessionStart> {
    const mission = missionId ? await this.missionFor(missionId, mode, language) : null;
    // Picks up sessions a failed or interrupted run left unremembered, in the background.
    void this.memory.sweep();
    const [targets, level] = await Promise.all([
      correctsMistakes(mode)
        ? Promise.all([this.bank.list(language), this.reviews.duePatterns(language, this.clock.now())]).then(([bank, due]) =>
            choosePracticeTargets(bank, due),
          )
        : [],
      this.levels.current(language),
    ]);
    const step = sessionStep(mode, level?.level ?? null);
    const track = startTrack(step, goalsFor(mode));
    const startedAt = this.clock.now();
    const [learnerContext, memory] = await Promise.all([this.learnerContext.load(), this.memory.recall({ startedAt })]);
    const created = await this.sessions.create({ mode, language, startedAt, targets, step, track, memory, missionId: mission?.id ?? null });
    const plan = track ? openingPlan(track, describeGoal, phrasesOf(mission)) : null;
    const opening = await this.tutor.open(tutorContext(created, learnerContext, phrasesOf(mission)), plan);
    await this.sessions.appendTurn(created.id, { role: "assistant", content: opening.line });
    // In the script the opening already does the first step, with its words to say.
    const scaffold = track && givesWords(track) ? opening.scaffold : null;
    const keyWords = scaffold && track?.support === "frame" ? opening.keyWords.slice(0, 3) : [];
    const session = { ...created, scaffold, keyWords };
    if (scaffold) {
      await this.sessions.setProgress(created.id, {
        coveredGoals: [],
        lastCheckInAt: null,
        metTargets: [],
        scaffold,
        keyWords,
        step,
        track,
      });
    }
    return { session, message: opening.line, goals: goalsFor(mode) };
  }

  /** The state of an open session, so the learner can go on where they left off. */
  async resume(sessionId: string): Promise<SessionResume> {
    const session = await openSession(this.sessions, sessionId);
    const turns = await this.sessions.history(sessionId);
    const { pending } = session;
    return {
      sessionId: session.id,
      mode: session.mode,
      language: session.language,
      startedAt: session.startedAt,
      turns,
      goals: goalsFor(session.mode),
      coveredGoals: session.coveredGoals,
      hint: pending
        ? {
            hintsGiven: pending.hintsGiven,
            revealed: pending.revealed,
            mistake: pending.original,
            mistakeType: pending.category,
            rule: shownRule(pending),
          }
        : null,
      track: trackView(session.track, goalsFor(session.mode)),
      scaffold: session.scaffold,
      keyWords: session.keyWords,
    };
  }

  private async missionFor(id: string, mode: Mode, language: string): Promise<Mission> {
    const mission = await this.missions.get(id);
    if (!mission) throw new MissionNotFoundError(id);
    if (mission.situation !== mode || mission.language !== language) {
      throw new InvalidInputError(`Mission ${id} is a ${mission.situation} in ${mission.language}, not a ${mode} in ${language}.`);
    }
    return mission;
  }
}

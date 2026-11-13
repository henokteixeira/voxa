import type {
  BankMistake,
  CheckInOverview,
  CheckInResult,
  FasterRoundsView,
  LearnerFact,
  LevelView,
  MissionModel,
  MissionView,
  PracticeView,
  ResumedSession,
  ReviewAnswer,
  ReviewCard,
  ReviewOverview,
  SessionSummary,
  SignalsHistoryEntry,
  StartedSession,
  TodayProgress,
  SentenceHelp,
  TurnResult,
} from "@voxa/contracts";
import type { CheckInsController } from "./check-ins/check-ins.controller.js";
import type { Json } from "./common/json.js";
import type { HealthController } from "./health/health.controller.js";
import type { LevelsController } from "./levels/levels.controller.js";
import type { MemoryController } from "./memory/memory.controller.js";
import type { MissionsController } from "./missions/missions.controller.js";
import type { MistakesController } from "./mistakes/mistakes.controller.js";
import type { PracticeController } from "./practice/practice.controller.js";
import type { ProgressController } from "./progress/progress.controller.js";
import type { ReviewsController } from "./reviews/reviews.controller.js";
import type { FasterRoundsController } from "./sessions/faster-rounds.controller.js";
import type { SessionsController } from "./sessions/sessions.controller.js";
import type { FillersController } from "./voice/fillers.controller.js";
import type { TranscriptionsController } from "./voice/transcriptions.controller.js";

/*
 * Checked when the API compiles: each endpoint's answer, once sent as JSON, has the shape the web app reads
 * (packages/contracts). A change to either side that breaks the other fails the build here.
 */

/** What the endpoint `Handler` sends. */
type Sent<Handler extends (...args: never[]) => unknown> = Json<Awaited<ReturnType<Handler>>>;

/**
 * Fails to compile unless `Answer` is a `Response`: every field the web reads is there with its type. Fields marked
 * optional in the contract (the web copes without them) and extra fields the web ignores still pass.
 */
type Answers<Response, Answer extends Response> = Answer;

export type ResponseContracts = [
  Answers<{ status: string }, Sent<HealthController["check"]>>,
  Answers<StartedSession, Sent<SessionsController["start"]>>,
  Answers<ResumedSession, Sent<SessionsController["resume"]>>,
  Answers<TurnResult, Sent<SessionsController["turn"]>>,
  Answers<SentenceHelp, Sent<SessionsController["help"]>>,
  Answers<SessionSummary, Sent<SessionsController["end"]>>,
  Answers<FasterRoundsView, Sent<FasterRoundsController["view"]>>,
  Answers<FasterRoundsView, Sent<FasterRoundsController["record"]>>,
  Answers<MissionView, Sent<MissionsController["today"]>>,
  Answers<MissionModel, Sent<MissionsController["model"]>>,
  Answers<MissionView, Sent<MissionsController["markStep"]>>,
  Answers<{ used: boolean }, Sent<MissionsController["say"]>>,
  Answers<CheckInOverview, Sent<CheckInsController["overview"]>>,
  Answers<CheckInResult, Sent<CheckInsController["record"]>>,
  Answers<CheckInResult, Sent<CheckInsController["result"]>>,
  Answers<LevelView, Sent<LevelsController["view"]>>,
  Answers<LevelView, Sent<LevelsController["set"]>>,
  Answers<LevelView, Sent<LevelsController["confirmStepChange"]>>,
  Answers<{ sessions: SignalsHistoryEntry[] }, Sent<ProgressController["signalsHistory"]>>,
  Answers<TodayProgress, Sent<ProgressController["today"]>>,
  Answers<TodayProgress, Sent<ProgressController["setDailyGoal"]>>,
  Answers<{ mistakes: BankMistake[] }, Sent<MistakesController["list"]>>,
  Answers<{ facts: LearnerFact[] }, Sent<MemoryController["list"]>>,
  Answers<LearnerFact, Sent<MemoryController["edit"]>>,
  Answers<PracticeView, Sent<PracticeController["view"]>>,
  Answers<ReviewOverview, Sent<ReviewsController["overview"]>>,
  Answers<ReviewCard, Sent<ReviewsController["card"]>>,
  Answers<ReviewAnswer, Sent<ReviewsController["answer"]>>,
  Answers<{ count: number }, Sent<FillersController["count"]>>,
  Answers<{ text: string }, Sent<TranscriptionsController["transcribe"]>>,
];

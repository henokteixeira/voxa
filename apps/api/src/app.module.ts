import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.js";
import { ConversationService } from "./application/conversation.service.js";
import { FillerSpeechService } from "./application/filler-speech.service.js";
import { LevelService } from "./application/level.service.js";
import { MistakeBankService } from "./application/mistake-bank.service.js";
import { ProgressService } from "./application/progress.service.js";
import { SignalsService } from "./application/signals.service.js";
import { VoiceConversationService } from "./application/voice-conversation.service.js";
import { CLOCK, systemClock } from "./domain/ports/clock.port.js";
import { LEARNER_CONTEXT_PORT } from "./domain/ports/learner-context.port.js";
import { LEVEL_ASSESSOR_PORT } from "./domain/ports/level-assessor.port.js";
import { LEVEL_REPOSITORY } from "./domain/ports/level.repository.js";
import { MISTAKE_BANK_REPOSITORY } from "./domain/ports/mistake-bank.repository.js";
import { MISTAKE_REPOSITORY } from "./domain/ports/mistake.repository.js";
import { PROGRESS_REPOSITORY } from "./domain/ports/progress.repository.js";
import { SESSION_REPOSITORY } from "./domain/ports/session.repository.js";
import { SIGNALS_REPOSITORY } from "./domain/ports/signals.repository.js";
import { TUTOR_PORT } from "./domain/ports/tutor.port.js";
import { STT_PORT, TTS_PORT } from "./domain/ports/voice.port.js";
import { HealthController } from "./health/health.controller.js";
import { DbModule } from "./infra/db/db.module.js";
import { DrizzleLevelRepository } from "./infra/db/drizzle-level.repository.js";
import { DrizzleMistakeRepository } from "./infra/db/drizzle-mistake.repository.js";
import { DrizzleProgressRepository } from "./infra/db/drizzle-progress.repository.js";
import { DrizzleSessionRepository } from "./infra/db/drizzle-session.repository.js";
import { DrizzleSignalsRepository } from "./infra/db/drizzle-signals.repository.js";
import { AnthropicLevelAssessor } from "./infra/tutor/anthropic-level-assessor.js";
import { AnthropicTutorAdapter, anthropicClientProvider } from "./infra/tutor/anthropic-tutor.adapter.js";
import { FileLearnerContext } from "./infra/tutor/file-learner-context.js";
import { LocalVoiceAdapter } from "./infra/voice/local-voice.adapter.js";
import { LevelsController } from "./levels/levels.controller.js";
import { MistakesController } from "./mistakes/mistakes.controller.js";
import { ReviewsController } from "./reviews/reviews.controller.js";
import { ReviewScheduler } from "./application/review-scheduler.js";
import { ReviewService } from "./application/review.service.js";
import { REVIEW_REPOSITORY } from "./domain/ports/review.repository.js";
import { REVIEW_COACH_PORT } from "./domain/ports/review-coach.port.js";
import { AnthropicReviewCoach } from "./infra/tutor/anthropic-review-coach.js";
import { DrizzleReviewRepository } from "./infra/db/drizzle-review.repository.js";
import { ProgressController } from "./progress/progress.controller.js";
import { SessionsController } from "./sessions/sessions.controller.js";
import { FillersController } from "./voice/fillers.controller.js";
import { VoiceSocketServer } from "./voice/voice-socket.server.js";

// The only place that binds ports to concrete implementations.
// Swapping the database, AI or voice provider = changing useClass/useExisting below.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env"], validate: validateEnv }), DbModule],
  controllers: [HealthController, SessionsController, MistakesController, FillersController, LevelsController, ProgressController, ReviewsController],
  providers: [
    ConversationService,
    MistakeBankService,
    ReviewScheduler,
    ReviewService,
    VoiceConversationService,
    FillerSpeechService,
    LevelService,
    ProgressService,
    SignalsService,
    VoiceSocketServer,
    anthropicClientProvider,
    { provide: CLOCK, useValue: systemClock },
    { provide: TUTOR_PORT, useClass: AnthropicTutorAdapter },
    { provide: LEVEL_ASSESSOR_PORT, useClass: AnthropicLevelAssessor },
    { provide: REVIEW_COACH_PORT, useClass: AnthropicReviewCoach },
    { provide: LEARNER_CONTEXT_PORT, useClass: FileLearnerContext },
    { provide: SESSION_REPOSITORY, useClass: DrizzleSessionRepository },
    { provide: LEVEL_REPOSITORY, useClass: DrizzleLevelRepository },
    { provide: PROGRESS_REPOSITORY, useClass: DrizzleProgressRepository },
    { provide: SIGNALS_REPOSITORY, useClass: DrizzleSignalsRepository },
    { provide: REVIEW_REPOSITORY, useClass: DrizzleReviewRepository },
    DrizzleMistakeRepository,
    { provide: MISTAKE_REPOSITORY, useExisting: DrizzleMistakeRepository },
    { provide: MISTAKE_BANK_REPOSITORY, useExisting: DrizzleMistakeRepository },
    LocalVoiceAdapter,
    { provide: STT_PORT, useExisting: LocalVoiceAdapter },
    { provide: TTS_PORT, useExisting: LocalVoiceAdapter },
  ],
})
export class AppModule {}

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.js";
import { ConversationService } from "./application/conversation.service.js";
import { CheckInService } from "./application/check-in.service.js";
import { MissionService } from "./application/mission.service.js";
import { FasterRoundsService } from "./application/faster-rounds.service.js";
import { FillerSpeechService } from "./application/filler-speech.service.js";
import { PracticeService } from "./application/practice.service.js";
import { PracticeController } from "./practice/practice.controller.js";
import { TranscriptionService } from "./application/transcription.service.js";
import { LearnerMemoryService } from "./application/learner-memory.service.js";
import { LevelService } from "./application/level.service.js";
import { MistakeBankService } from "./application/mistake-bank.service.js";
import { ProgressService } from "./application/progress.service.js";
import { SignalsService } from "./application/signals.service.js";
import { VoiceConversationService } from "./application/voice-conversation.service.js";
import { CLOCK, systemClock } from "./domain/ports/clock.port.js";
import { CHECK_IN_REPOSITORY } from "./domain/ports/check-in.repository.js";
import { MISSION_COACH_PORT } from "./domain/ports/mission-coach.port.js";
import { MISSION_REPOSITORY } from "./domain/ports/mission.repository.js";
import { FASTER_ROUND_REPOSITORY } from "./domain/ports/faster-round.repository.js";
import { LEARNER_CONTEXT_PORT } from "./domain/ports/learner-context.port.js";
import { LEARNER_MEMORY_REPOSITORY } from "./domain/ports/learner-memory.repository.js";
import { MEMORY_EXTRACTOR_PORT } from "./domain/ports/memory-extractor.port.js";
import { CHECK_IN_READER_PORT } from "./domain/ports/check-in-reader.port.js";
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
import { DrizzleCheckInRepository } from "./infra/db/drizzle-check-in.repository.js";
import { DrizzleMissionRepository } from "./infra/db/drizzle-mission.repository.js";
import { AnthropicMissionCoach } from "./infra/tutor/anthropic-mission-coach.js";
import { DrizzleFasterRoundRepository } from "./infra/db/drizzle-faster-round.repository.js";
import { DrizzleLearnerMemoryRepository } from "./infra/db/drizzle-learner-memory.repository.js";
import { DrizzleLevelRepository } from "./infra/db/drizzle-level.repository.js";
import { DrizzleMistakeRepository } from "./infra/db/drizzle-mistake.repository.js";
import { DrizzleProgressRepository } from "./infra/db/drizzle-progress.repository.js";
import { DrizzleSessionRepository } from "./infra/db/drizzle-session.repository.js";
import { DrizzleSignalsRepository } from "./infra/db/drizzle-signals.repository.js";
import { DrizzleUnitOfWork } from "./infra/db/drizzle-unit-of-work.js";
import { UNIT_OF_WORK } from "./domain/ports/unit-of-work.port.js";
import { AnthropicMemoryExtractor } from "./infra/tutor/anthropic-memory-extractor.js";
import { AnthropicCheckInReader } from "./infra/tutor/anthropic-check-in-reader.js";
import { AnthropicLevelAssessor } from "./infra/tutor/anthropic-level-assessor.js";
import { AnthropicTutorAdapter, anthropicClientProvider } from "./infra/tutor/anthropic-tutor.adapter.js";
import { FileLearnerContext } from "./infra/tutor/file-learner-context.js";
import { LocalVoiceAdapter } from "./infra/voice/local-voice.adapter.js";
import { LevelsController } from "./levels/levels.controller.js";
import { MemoryController } from "./memory/memory.controller.js";
import { MistakesController } from "./mistakes/mistakes.controller.js";
import { ReviewsController } from "./reviews/reviews.controller.js";
import { ReviewScheduler } from "./application/review-scheduler.js";
import { ReviewService } from "./application/review.service.js";
import { REVIEW_REPOSITORY } from "./domain/ports/review.repository.js";
import { REVIEW_COACH_PORT } from "./domain/ports/review-coach.port.js";
import { AnthropicReviewCoach } from "./infra/tutor/anthropic-review-coach.js";
import { DrizzleReviewRepository } from "./infra/db/drizzle-review.repository.js";
import { ProgressController } from "./progress/progress.controller.js";
import { CheckInsController } from "./check-ins/check-ins.controller.js";
import { MissionsController } from "./missions/missions.controller.js";
import { FasterRoundsController } from "./sessions/faster-rounds.controller.js";
import { SessionsController } from "./sessions/sessions.controller.js";
import { TranscriptionsController } from "./voice/transcriptions.controller.js";
import { FillersController } from "./voice/fillers.controller.js";
import { VoiceSocketServer } from "./voice/voice-socket.server.js";

// The only place that binds ports to concrete implementations.
// Swapping the database, AI or voice provider = changing useClass/useExisting below.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env"], validate: validateEnv }), DbModule],
  controllers: [HealthController, SessionsController, MistakesController, FillersController, LevelsController, ProgressController, ReviewsController, TranscriptionsController, PracticeController, MemoryController, FasterRoundsController, CheckInsController, MissionsController],
  providers: [
    ConversationService,
    MistakeBankService,
    ReviewScheduler,
    ReviewService,
    VoiceConversationService,
    FillerSpeechService,
    FasterRoundsService,
    CheckInService,
    MissionService,
    PracticeService,
    TranscriptionService,
    LearnerMemoryService,
    LevelService,
    ProgressService,
    SignalsService,
    VoiceSocketServer,
    anthropicClientProvider,
    { provide: CLOCK, useValue: systemClock },
    { provide: TUTOR_PORT, useClass: AnthropicTutorAdapter },
    { provide: LEVEL_ASSESSOR_PORT, useClass: AnthropicLevelAssessor },
    { provide: CHECK_IN_READER_PORT, useClass: AnthropicCheckInReader },
    { provide: REVIEW_COACH_PORT, useClass: AnthropicReviewCoach },
    { provide: LEARNER_CONTEXT_PORT, useClass: FileLearnerContext },
    { provide: MEMORY_EXTRACTOR_PORT, useClass: AnthropicMemoryExtractor },
    { provide: LEARNER_MEMORY_REPOSITORY, useClass: DrizzleLearnerMemoryRepository },
    { provide: SESSION_REPOSITORY, useClass: DrizzleSessionRepository },
    { provide: LEVEL_REPOSITORY, useClass: DrizzleLevelRepository },
    { provide: PROGRESS_REPOSITORY, useClass: DrizzleProgressRepository },
    { provide: SIGNALS_REPOSITORY, useClass: DrizzleSignalsRepository },
    { provide: FASTER_ROUND_REPOSITORY, useClass: DrizzleFasterRoundRepository },
    { provide: CHECK_IN_REPOSITORY, useClass: DrizzleCheckInRepository },
    { provide: MISSION_REPOSITORY, useClass: DrizzleMissionRepository },
    { provide: MISSION_COACH_PORT, useClass: AnthropicMissionCoach },
    { provide: REVIEW_REPOSITORY, useClass: DrizzleReviewRepository },
    { provide: UNIT_OF_WORK, useClass: DrizzleUnitOfWork },
    DrizzleMistakeRepository,
    { provide: MISTAKE_REPOSITORY, useExisting: DrizzleMistakeRepository },
    { provide: MISTAKE_BANK_REPOSITORY, useExisting: DrizzleMistakeRepository },
    LocalVoiceAdapter,
    { provide: STT_PORT, useExisting: LocalVoiceAdapter },
    { provide: TTS_PORT, useExisting: LocalVoiceAdapter },
  ],
})
export class AppModule {}

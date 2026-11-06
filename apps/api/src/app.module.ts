import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ConversationService } from "./application/conversation.service.js";
import { VoiceConversationService } from "./application/voice-conversation.service.js";
import { LEARNER_CONTEXT_PORT } from "./domain/ports/learner-context.port.js";
import { MISTAKE_REPOSITORY } from "./domain/ports/mistake.repository.js";
import { SESSION_REPOSITORY } from "./domain/ports/session.repository.js";
import { TUTOR_PORT } from "./domain/ports/tutor.port.js";
import { STT_PORT, TTS_PORT } from "./domain/ports/voice.port.js";
import { HealthController } from "./health/health.controller.js";
import { DbModule } from "./infra/db/db.module.js";
import { DrizzleMistakeRepository } from "./infra/db/drizzle-mistake.repository.js";
import { DrizzleSessionRepository } from "./infra/db/drizzle-session.repository.js";
import { AnthropicTutorAdapter, anthropicClientProvider } from "./infra/tutor/anthropic-tutor.adapter.js";
import { FileLearnerContext } from "./infra/tutor/file-learner-context.js";
import { LocalVoiceAdapter } from "./infra/voice/local-voice.adapter.js";
import { SessionsController } from "./sessions/sessions.controller.js";
import { VoiceSocketServer } from "./voice/voice-socket.server.js";

// The only place that binds ports to concrete implementations.
// Swapping the database, AI or voice provider = changing useClass/useExisting below.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env"] }), DbModule],
  controllers: [HealthController, SessionsController],
  providers: [
    ConversationService,
    VoiceConversationService,
    VoiceSocketServer,
    anthropicClientProvider,
    { provide: TUTOR_PORT, useClass: AnthropicTutorAdapter },
    { provide: LEARNER_CONTEXT_PORT, useClass: FileLearnerContext },
    { provide: SESSION_REPOSITORY, useClass: DrizzleSessionRepository },
    { provide: MISTAKE_REPOSITORY, useClass: DrizzleMistakeRepository },
    LocalVoiceAdapter,
    { provide: STT_PORT, useExisting: LocalVoiceAdapter },
    { provide: TTS_PORT, useExisting: LocalVoiceAdapter },
  ],
})
export class AppModule {}

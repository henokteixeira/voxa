import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LLM_PORT } from "./domain/ports/llm.port.js";
import { MISTAKE_REPOSITORY } from "./domain/ports/mistake.repository.js";
import { STT_PORT, TTS_PORT } from "./domain/ports/voice.port.js";
import { HealthController } from "./health/health.controller.js";
import { DbModule } from "./infra/db/db.module.js";
import { DrizzleMistakeRepository } from "./infra/db/drizzle-mistake.repository.js";
import { AnthropicLlmAdapter } from "./infra/llm/anthropic-llm.adapter.js";
import { LocalVoiceAdapter } from "./infra/voice/local-voice.adapter.js";

// Aqui é o único lugar que liga portas a implementações concretas.
// Trocar banco, IA ou voz = trocar o useClass/useExisting abaixo.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env"] }), DbModule],
  controllers: [HealthController],
  providers: [
    { provide: LLM_PORT, useClass: AnthropicLlmAdapter },
    LocalVoiceAdapter,
    { provide: STT_PORT, useExisting: LocalVoiceAdapter },
    { provide: TTS_PORT, useExisting: LocalVoiceAdapter },
    { provide: MISTAKE_REPOSITORY, useClass: DrizzleMistakeRepository },
  ],
})
export class AppModule {}

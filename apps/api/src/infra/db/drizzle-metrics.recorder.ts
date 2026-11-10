import { Inject, Injectable, Logger } from "@nestjs/common";
import type { MetricsRecorder, ModelCall, VoiceTurnTiming } from "../../domain/ports/metrics.port.js";
import { DATABASE, type Database } from "./db.module.js";
import { modelCalls, voiceTurnTimings } from "./schema.js";

@Injectable()
export class DrizzleMetricsRecorder implements MetricsRecorder {
  private readonly logger = new Logger(DrizzleMetricsRecorder.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async voiceTurn(timing: VoiceTurnTiming): Promise<void> {
    await this.quietly("voice turn", () => this.db.insert(voiceTurnTimings).values(timing));
  }

  async modelCall(call: ModelCall): Promise<void> {
    await this.quietly("model call", () => this.db.insert(modelCalls).values(call));
  }

  private async quietly(what: string, write: () => PromiseLike<unknown>): Promise<void> {
    try {
      await write();
    } catch (error) {
      // A failed query's message is the SQL; the database's reason is its cause.
      const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
      this.logger.warn(`Could not record a ${what}: ${error instanceof Error ? error.message : String(error)}${cause}`);
    }
  }
}

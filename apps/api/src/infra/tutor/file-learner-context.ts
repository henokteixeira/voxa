import { readFile } from "node:fs/promises";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.js";
import type { LearnerContextPort } from "../../domain/ports/learner-context.port.js";

/** Reads the learner's professional context from a local file, once. */
@Injectable()
export class FileLearnerContext implements LearnerContextPort {
  private readonly logger = new Logger(FileLearnerContext.name);
  private readonly path: string;
  private cached: Promise<string> | null = null;

  constructor(config: ConfigService<Env, true>) {
    this.path = config.get("TUTOR_CONTEXT_FILE", { infer: true });
  }

  load(): Promise<string> {
    this.cached ??= readFile(this.path, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        this.cached = null; // try again on the next turn
        throw error;
      }
      this.logger.warn(`No learner context at ${this.path}; the tutor will ask about your work instead.`);
      return "";
    });
    return this.cached;
  }
}

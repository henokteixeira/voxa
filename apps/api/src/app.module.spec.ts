import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionStartService } from "./application/session-start.service.js";
import { SessionSummaryService } from "./application/session-summary.service.js";
import { TurnService } from "./application/turn.service.js";

afterEach(() => vi.unstubAllEnvs());

describe("AppModule", () => {
  // Unit tests build services with `new`; only this one checks Nest can inject every provider.
  it("resolves every provider (nothing is called: the database pool only connects on a query)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://voxa:voxa@localhost:5432/voxa");
    // Imported once the environment is set: the module reads it when it loads.
    const { AppModule } = await import("./app.module.js");
    const app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    for (const service of [SessionStartService, TurnService, SessionSummaryService]) {
      expect(app.get(service)).toBeInstanceOf(service);
    }
    await app.close();
  });
});

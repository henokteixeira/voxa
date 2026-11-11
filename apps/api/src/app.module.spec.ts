import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionStartService } from "./application/session-start.service.js";
import { SessionSummaryService } from "./application/session-summary.service.js";
import { TurnService } from "./application/turn.service.js";
import { LEARNER_ID } from "./infra/db/learner.js";

afterEach(() => vi.unstubAllEnvs());

describe("AppModule", () => {
  // Unit tests build services with `new`; only this one checks Nest can inject every provider.
  it("resolves every provider (nothing else is called: the database pool only connects on a query)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://voxa:voxa@localhost:5432/voxa");
    // Imported once the environment is set: the module reads it when it loads.
    const { AppModule } = await import("./app.module.js");
    // The one provider that queries at start: the learner, read from the database.
    const app = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LEARNER_ID)
      .useValue("6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b")
      .compile();
    for (const service of [SessionStartService, TurnService, SessionSummaryService]) {
      expect(app.get(service)).toBeInstanceOf(service);
    }
    await app.close();
  });
});

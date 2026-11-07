import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressService } from "../application/progress.service.js";
import { ProgressController } from "./progress.controller.js";

const service = { today: vi.fn(), setDailyMinutes: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [ProgressController],
    providers: [{ provide: ProgressService, useValue: service }],
  }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterEach(() => app.close());

describe("GET /progress/today", () => {
  it("reads today in the learner's time zone", async () => {
    service.today.mockResolvedValue({ earnedXp: 12 });
    const res = await request(app.getHttpServer()).get("/progress/today?timeZone=America/Sao_Paulo");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ earnedXp: 12 });
    expect(service.today).toHaveBeenCalledWith("en", "America/Sao_Paulo");
  });

  it.each(["", "?timeZone=Mars/Olympus"])("rejects a missing or unknown time zone (%s)", async (query) => {
    expect((await request(app.getHttpServer()).get(`/progress/today${query}`)).status).toBe(400);
    expect(service.today).not.toHaveBeenCalled();
  });
});

describe("PUT /progress/daily-goal", () => {
  it("sets the minutes a day", async () => {
    service.setDailyMinutes.mockResolvedValue({ minutesPerDay: 45 });
    const res = await request(app.getHttpServer())
      .put("/progress/daily-goal")
      .send({ minutesPerDay: 45, timeZone: "UTC" });
    expect(res.status).toBe(200);
    expect(service.setDailyMinutes).toHaveBeenCalledWith("en", 45, "UTC");
  });

  it.each([[{ minutesPerDay: 20, timeZone: "UTC" }], [{ minutesPerDay: "30", timeZone: "UTC" }], [{ minutesPerDay: 30 }]])(
    "rejects %j",
    async (body) => {
      expect((await request(app.getHttpServer()).put("/progress/daily-goal").send(body)).status).toBe(400);
      expect(service.setDailyMinutes).not.toHaveBeenCalled();
    },
  );
});

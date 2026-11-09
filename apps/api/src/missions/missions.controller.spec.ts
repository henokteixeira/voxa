import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionNotFoundError, MissionService } from "../application/mission.service.js";
import { applyHttpConventions } from "../common/http-app.js";
import { MissionsController } from "./missions.controller.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const service = { today: vi.fn(), model: vi.fn(), modelSpeech: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [MissionsController],
    providers: [{ provide: MissionService, useValue: service }],
  }).compile();
  app = applyHttpConventions(mod.createNestApplication());
  await app.init();
});
afterEach(() => app.close());

describe("/missions", () => {
  it("gives the mission of the learner's local day", async () => {
    service.today.mockResolvedValue({ id, language: "en", day: "2026-11-09", situation: "daily" });
    const res = await request(app.getHttpServer()).get("/missions/today?timeZone=America/Sao_Paulo");
    expect(res.status).toBe(200);
    expect(service.today).toHaveBeenCalledWith("en", "America/Sao_Paulo");
    expect((await request(app.getHttpServer()).get("/missions/today?timeZone=Mars/Base")).status).toBe(400);
    expect((await request(app.getHttpServer()).get("/missions/today?timeZone=UTC&language=EN_us")).status).toBe(400);
    expect((await request(app.getHttpServer()).get("/missions/today")).status).toBe(400);
  });

  it("gives the model, and 404 for an unknown mission", async () => {
    service.model.mockResolvedValueOnce({ speaker: "Alex", text: "Hi.", expressions: [] });
    expect((await request(app.getHttpServer()).get(`/missions/${id}/model`)).body).toMatchObject({ speaker: "Alex" });
    service.model.mockRejectedValueOnce(new MissionNotFoundError(id));
    expect((await request(app.getHttpServer()).get(`/missions/${id}/model`)).status).toBe(404);
    expect((await request(app.getHttpServer()).get("/missions/nope/model")).status).toBe(400);
  });

  it("serves the model as WAV", async () => {
    service.modelSpeech.mockResolvedValue(Buffer.from("RIFF"));
    const res = await request(app.getHttpServer()).get(`/missions/${id}/model/speech`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("audio/wav");
  });
});

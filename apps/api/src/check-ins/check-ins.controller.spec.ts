import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckInNotFoundError, CheckInService } from "../application/check-in.service.js";
import { applyHttpConventions } from "../common/http-app.js";
import { CheckInsController, MAX_CHECK_IN_BYTES } from "./check-ins.controller.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const service = { overview: vi.fn(), record: vi.fn(), result: vi.fn(), recording: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [CheckInsController],
    providers: [{ provide: CheckInService, useValue: service }],
  }).compile();
  app = applyHttpConventions(mod.createNestApplication());
  await app.init();
});
afterEach(() => app.close());

describe("/check-ins", () => {
  it("records a check-in from the raw recording and the measure in the query", async () => {
    service.record.mockResolvedValue({ checkIn: { id }, previous: null });
    const audio = Buffer.from("RIFF....WAVE");
    const res = await request(app.getHttpServer())
      .post("/check-ins?speechMs=90000&pausesMs=1200,300")
      .set("content-type", "audio/wav")
      .send(audio);
    expect(res.status).toBe(201);
    expect(service.record).toHaveBeenCalledWith("en", { mimeType: "audio/wav", audio }, { speechMs: 90_000, pausesMs: [1_200, 300] }, "present_project");
    await request(app.getHttpServer()).post("/check-ins?speechMs=30000&task=last_weekend").set("content-type", "audio/wav").send(audio).expect(201);
    expect(service.record).toHaveBeenLastCalledWith("en", { mimeType: "audio/wav", audio }, { speechMs: 30_000, pausesMs: [] }, "last_weekend");
  });

  it.each([
    ["?pausesMs=1200", "audio/wav"],
    ["?speechMs=1000", "audio/webm"],
    ["?speechMs=1000&pausesMs=a", "audio/wav"],
    ["?speechMs=1000&pausesMs=1500", "audio/wav"],
    ["?speechMs=0", "audio/wav"],
    ["?speechMs=1000&task=unknown_topic", "audio/wav"],
  ])(
    "rejects %s as %s",
    async (query, type) => {
      const res = await request(app.getHttpServer()).post(`/check-ins${query}`).set("content-type", type).send(Buffer.from("x"));
      expect(res.status).toBe(400);
    },
  );

  it("refuses a recording over the limit", async () => {
    const res = await request(app.getHttpServer())
      .post("/check-ins?speechMs=1000")
      .set("content-type", "audio/wav")
      .send(Buffer.alloc(MAX_CHECK_IN_BYTES + 1));
    expect(res.status).toBe(400);
    expect(service.record).not.toHaveBeenCalled();
  });

  it("serves a recording, and 404 for an unknown check-in", async () => {
    service.recording.mockResolvedValue({ mimeType: "audio/wav", audio: Buffer.from("RIFF") });
    const res = await request(app.getHttpServer()).get(`/check-ins/${id}/recording`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("audio/wav");

    service.result.mockRejectedValue(new CheckInNotFoundError(id));
    expect((await request(app.getHttpServer()).get(`/check-ins/${id}`)).status).toBe(404);
  });
});

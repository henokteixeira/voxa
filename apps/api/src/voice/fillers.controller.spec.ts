import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FillerNotFoundError, FillerSpeechService } from "../application/filler-speech.service.js";
import { VoiceUnavailableError } from "../domain/ports/voice.port.js";
import { FillersController } from "./fillers.controller.js";

const service = { count: vi.fn(), speech: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [FillersController],
    providers: [{ provide: FillerSpeechService, useValue: service }],
  }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterEach(() => app.close());

describe("GET /voice/fillers", () => {
  it("counts the lines, in English by default", async () => {
    service.count.mockReturnValue(5);
    const res = await request(app.getHttpServer()).get("/voice/fillers");
    expect(res.body).toEqual({ count: 5 });
    expect(service.count).toHaveBeenCalledWith("en");
  });

  it("rejects a malformed language", async () => {
    expect((await request(app.getHttpServer()).get("/voice/fillers?language=English")).status).toBe(400);
  });
});

describe("GET /voice/fillers/:index", () => {
  it("returns the line's speech as WAV", async () => {
    service.speech.mockResolvedValue(Buffer.from("RIFFwav"));
    const res = await request(app.getHttpServer()).get("/voice/fillers/2?language=en-US");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/wav");
    expect(Buffer.from(res.body as Buffer).toString()).toBe("RIFFwav");
    expect(service.speech).toHaveBeenCalledWith("en-US", 2);
  });

  it("answers 400 for a bad index, 404 for a missing line and 503 when the voice is down", async () => {
    expect((await request(app.getHttpServer()).get("/voice/fillers/x")).status).toBe(400);
    service.speech.mockRejectedValueOnce(new FillerNotFoundError("en", 9));
    expect((await request(app.getHttpServer()).get("/voice/fillers/9")).status).toBe(404);
    service.speech.mockRejectedValueOnce(new VoiceUnavailableError("down"));
    expect((await request(app.getHttpServer()).get("/voice/fillers/0")).status).toBe(503);
  });
});

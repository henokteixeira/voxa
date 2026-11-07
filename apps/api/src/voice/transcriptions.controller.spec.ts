import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptionService } from "../application/transcription.service.js";
import { applyHttpConventions } from "../common/http-app.js";
import { STT_PORT, VoiceUnavailableError } from "../domain/ports/voice.port.js";
import { MAX_RECORDING_BYTES, TranscriptionsController } from "./transcriptions.controller.js";

const stt = { transcribe: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [TranscriptionsController],
    providers: [TranscriptionService, { provide: STT_PORT, useValue: stt }],
  }).compile();
  app = applyHttpConventions(mod.createNestApplication());
  await app.init();
});
afterEach(() => app.close());

const post = (body: Buffer, type = "audio/wav", query = "") =>
  request(app.getHttpServer()).post(`/voice/transcriptions${query}`).set("content-type", type).send(body);

describe("POST /voice/transcriptions", () => {
  it("transcribes the recording in the language, English by default", async () => {
    stt.transcribe.mockResolvedValue({ text: "  I finished it yesterday. ", language: "en" });
    const audio = Buffer.from("RIFF....WAVE");

    const res = await post(audio);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "I finished it yesterday." });
    expect(stt.transcribe).toHaveBeenCalledWith(audio, "en", { mimeType: "audio/wav" });

    await post(audio, "Audio/WebM;codecs=opus", "?language=es").expect(200);
    expect(stt.transcribe).toHaveBeenLastCalledWith(audio, "es", { mimeType: "audio/webm" });
  });

  it("refuses a body that is not audio, is empty, or is too long", async () => {
    expect((await post(Buffer.from("{}"), "application/json")).status).toBe(400);
    expect((await post(Buffer.alloc(0))).status).toBe(400);
    expect((await post(Buffer.alloc(MAX_RECORDING_BYTES + 1))).status).toBe(400);
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it("answers 503 when the voice server is down", async () => {
    stt.transcribe.mockRejectedValue(new VoiceUnavailableError("connect ECONNREFUSED"));
    const res = await post(Buffer.from("RIFF"));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("voice_unavailable");
  });
});

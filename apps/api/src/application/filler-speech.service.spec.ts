import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceUnavailableError } from "../domain/ports/voice.port.js";
import { FillerNotFoundError, FillerSpeechService } from "./filler-speech.service.js";

const tts = { synthesize: vi.fn() };
let service: FillerSpeechService;

beforeEach(() => {
  vi.resetAllMocks();
  tts.synthesize.mockResolvedValue(Buffer.from("wav"));
  service = new FillerSpeechService(tts);
});

describe("FillerSpeechService", () => {
  it("counts the lines of a language", () => {
    expect(service.count("en-US")).toBe(5);
    expect(service.count("fr")).toBe(0);
  });

  it("speaks a line in the asked language and reuses the audio", async () => {
    expect(await service.speech("en-US", 0)).toEqual(Buffer.from("wav"));
    await service.speech("en-US", 0);
    expect(tts.synthesize).toHaveBeenCalledTimes(1);
    expect(tts.synthesize).toHaveBeenCalledWith("Mm-hmm, let me think.", "en-US");
  });

  it("tries again after a failed synthesis", async () => {
    tts.synthesize.mockRejectedValueOnce(new VoiceUnavailableError("down"));
    await expect(service.speech("en", 1)).rejects.toThrow(VoiceUnavailableError);
    expect(await service.speech("en", 1)).toEqual(Buffer.from("wav"));
    expect(tts.synthesize).toHaveBeenCalledTimes(2);
  });

  it("keeps the cache bounded when many language tags are asked for", async () => {
    for (let i = 0; i < 60; i++) await service.speech(`en-x-${i}`, 0);
    await service.speech("en-x-0", 0);
    expect(tts.synthesize).toHaveBeenCalledTimes(61);
  });

  it("rejects a line that does not exist", async () => {
    await expect(service.speech("en", 5)).rejects.toThrow(FillerNotFoundError);
    await expect(service.speech("fr", 0)).rejects.toThrow(FillerNotFoundError);
    expect(tts.synthesize).not.toHaveBeenCalled();
  });
});

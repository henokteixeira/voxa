import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { CheckIn } from "../domain/check-in/check-in.js";
import type { CheckInReaderPort } from "../domain/ports/check-in-reader.port.js";
import type { CheckInRecording, CheckInRepository } from "../domain/ports/check-in.repository.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";
import { CheckInNotDueError, CheckInNotFoundError, CheckInService } from "./check-in.service.js";

class FakeCheckIns implements CheckInRepository {
  rows: (CheckIn & { recording: CheckInRecording })[] = [];
  async create(checkIn: Omit<CheckIn, "id">, recording: CheckInRecording) {
    const row = { ...checkIn, id: `c${this.rows.length + 1}`, recording };
    this.rows.push(row);
    const { recording: _r, ...stored } = row;
    return stored;
  }
  async get(id: string) {
    return (await this.list()).find((c) => c.id === id) ?? null;
  }
  async list(language = "en", limit?: number) {
    return this.rows
      .filter((r) => r.language === language)
      .map(({ recording: _r, ...c }) => c)
      .reverse()
      .slice(0, limit);
  }
  async previous(id: string) {
    const index = this.rows.findIndex((r) => r.id === id);
    const before = this.rows.slice(0, Math.max(index, 0)).filter((r) => r.language === this.rows[index]?.language).pop();
    if (!before) return null;
    const { recording: _r, ...checkIn } = before;
    return checkIn;
  }
  async recording(id: string) {
    return this.rows.find((r) => r.id === id)?.recording ?? null;
  }
}

function setup(heard = "My project helps volunteers find a place to serve", reader?: CheckInReaderPort) {
  const clock = { at: new Date("2026-11-09T10:00:00Z"), now: () => clock.at };
  const checkIns = new FakeCheckIns();
  const stt = { transcribe: async () => ({ text: ` ${heard} `, language: "en" }) };
  const read = reader ?? { read: vi.fn().mockResolvedValue({ mistakes: 1, otherLanguageWords: 0 }) };
  return { clock, checkIns, read, service: new CheckInService(checkIns, stt, clock, read) };
}
const wav = { mimeType: "audio/wav", audio: Buffer.from([1, 2, 3]) };

describe("CheckInService", () => {
  it("is due at once the first time and 2 weeks after the last one", async () => {
    const { service, clock } = setup();
    expect(await service.overview("en")).toMatchObject({ task: "present_project", limitMs: 120_000, due: true, checkIns: [] });

    await service.record("en", wav, { speechMs: 6_000, pausesMs: [] });
    clock.at = new Date("2026-11-22T10:00:00Z");
    expect(await service.overview("en")).toMatchObject({ due: false, dueAt: new Date("2026-11-23T10:00:00Z") });
  });

  it("transcribes the recording, keeps it, and compares with the check-in before", async () => {
    const { service, checkIns, clock } = setup();
    const first = await service.record("en", wav, { speechMs: 12_000, pausesMs: [500, 1_200, 2_000] });
    expect(first).toMatchObject({
      checkIn: { wordsPerMinute: 45, longPauses: 2, transcript: "My project helps volunteers find a place to serve" },
      previous: null,
    });
    // Not due again for 2 weeks.
    await expect(service.record("en", wav, { speechMs: 6_000, pausesMs: [] })).rejects.toBeInstanceOf(CheckInNotDueError);
    clock.at = new Date("2026-11-23T10:00:00Z");
    const second = await service.record("en", wav, { speechMs: 6_000, pausesMs: [] });
    expect(second.previous).toMatchObject({ id: first.checkIn.id, wordsPerMinute: 45 });
    expect(await service.result(first.checkIn.id)).toEqual(first);
    expect(await service.recording(second.checkIn.id)).toEqual(wav);
    expect(checkIns.rows).toHaveLength(2);
  });

  it("counts the mistakes and other-language words the tutor finds in the transcript", async () => {
    const reader = { read: vi.fn().mockResolvedValue({ mistakes: 2, otherLanguageWords: 1 }) };
    const { service } = setup("My project help volunteers to find um lugar to serve", reader);
    const result = await service.record("en", wav, { speechMs: 12_000, pausesMs: [] });
    expect(reader.read).toHaveBeenCalledWith({ language: "en", transcript: "My project help volunteers to find um lugar to serve" });
    expect(result.checkIn).toMatchObject({ mistakesPer100Words: 20, otherLanguageWords: 1 });
  });

  it("keeps the check-in without mistake numbers when the tutor can't read it", async () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    const reader = { read: vi.fn().mockRejectedValue(new TutorUnavailableError("down")) };
    const { service, checkIns } = setup(undefined, reader);
    const result = await service.record("en", wav, { speechMs: 12_000, pausesMs: [] });
    expect(result.checkIn).toMatchObject({ wordsPerMinute: 45, mistakesPer100Words: null, otherLanguageWords: null });
    expect(checkIns.rows).toHaveLength(1);
  });

  it("refuses a silent recording, one too long, and unknown check-ins", async () => {
    await expect(setup("").service.record("en", wav, { speechMs: 1_000, pausesMs: [] })).rejects.toMatchObject({ code: "invalid" });
    await expect(setup().service.record("en", wav, { speechMs: 130_000, pausesMs: [] })).rejects.toMatchObject({ code: "invalid" });
    await expect(setup().service.result("nope")).rejects.toBeInstanceOf(CheckInNotFoundError);
  });
});

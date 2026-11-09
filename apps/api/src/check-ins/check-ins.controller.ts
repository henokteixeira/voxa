import { Controller, Get, Headers, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { CheckInService } from "../application/check-in.service.js";
import { Language, parse, readRawBody } from "../common/http.js";
import { InvalidInputError } from "../domain/errors.js";

/** About 3 minutes of 16 kHz 16-bit mono WAV: a 2-minute check-in with room to spare. */
export const MAX_CHECK_IN_BYTES = 6 * 1024 * 1024;

const Ms = z.coerce.number<string>().int().min(0).max(10 * 60 * 1000);
const LanguageQuery = z.object({ language: Language });
/** The measure travels in the query, since the body is the recording. `pausesMs` is comma-separated. */
const RecordQuery = z.object({
  language: Language,
  speechMs: Ms,
  pausesMs: z
    .string()
    .max(20_000)
    .default("")
    .transform((list) => (list ? list.split(",") : []))
    .pipe(z.array(Ms).max(1000)),
});
const AudioType = z
  .string()
  .regex(/^audio\/[\w.+-]+$/i, "The body must be audio, e.g. audio/wav.")
  .transform((type) => type.toLowerCase());
const CheckInId = z.uuid();

/** The check-in every 2 weeks: the same 2-minute task, its recording, and how it compares. */
@Controller("check-ins")
export class CheckInsController {
  constructor(private readonly checkIns: CheckInService) {}

  @Get()
  overview(@Query() query: unknown) {
    return this.checkIns.overview(parse(LanguageQuery, query).language);
  }

  /** The raw recording is the body (e.g. audio/wav). */
  @Post()
  async record(@Query() query: unknown, @Headers("content-type") contentType: string | undefined, @Req() req: Request) {
    const { language, speechMs, pausesMs } = parse(RecordQuery, query);
    const mimeType = parse(AudioType, contentType?.split(";")[0]?.trim());
    if (Number(req.headers["content-length"]) > MAX_CHECK_IN_BYTES) {
      req.resume();
      throw new InvalidInputError(`The recording is over ${MAX_CHECK_IN_BYTES} bytes.`);
    }
    const audio = await readRawBody(req, MAX_CHECK_IN_BYTES);
    return this.checkIns.record(language, { mimeType, audio }, { speechMs, pausesMs });
  }

  @Get(":id")
  result(@Param("id") id: string) {
    return this.checkIns.result(parse(CheckInId, id));
  }

  @Get(":id/recording")
  async recording(@Param("id") id: string, @Res() res: Response) {
    const { mimeType, audio } = await this.checkIns.recording(parse(CheckInId, id));
    res.type(mimeType).set("cache-control", "private, max-age=86400").send(audio);
  }
}

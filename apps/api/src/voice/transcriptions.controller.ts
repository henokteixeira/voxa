import { Controller, Headers, HttpCode, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { TranscriptionService } from "../application/transcription.service.js";
import { Language, parse, readRawBody } from "../common/http.js";
import { InvalidInputError } from "../domain/errors.js";

/** About a minute of 16 kHz 16-bit mono speech: a review answer is a sentence or two. */
export const MAX_RECORDING_BYTES = 2 * 1024 * 1024;

const TranscriptionQuery = z.object({ language: Language });
const AudioType = z
  .string()
  .regex(/^audio\/[\w.+-]+$/i, "The body must be audio, e.g. audio/wav.")
  .transform((type) => type.toLowerCase());

/** Short recordings to text, for spoken answers outside the live session socket. */
@Controller("voice/transcriptions")
export class TranscriptionsController {
  constructor(private readonly transcriptions: TranscriptionService) {}

  /** The raw recording is the body (e.g. audio/wav); answers { text }. */
  @Post()
  @HttpCode(200)
  async transcribe(@Query() query: unknown, @Headers("content-type") contentType: string | undefined, @Req() req: Request) {
    const { language } = parse(TranscriptionQuery, query);
    const mimeType = parse(AudioType, contentType?.split(";")[0]?.trim());
    // Refused before reading when the client says it is too long.
    if (Number(req.headers["content-length"]) > MAX_RECORDING_BYTES) {
      req.resume();
      throw new InvalidInputError(`The recording is over ${MAX_RECORDING_BYTES} bytes.`);
    }
    const audio = await readRawBody(req, MAX_RECORDING_BYTES);
    return this.transcriptions.transcribe(audio, language, mimeType);
  }
}

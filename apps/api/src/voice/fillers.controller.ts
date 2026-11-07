import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { FillerSpeechService } from "../application/filler-speech.service.js";
import { Language, parse } from "../common/http.js";

const LanguageQuery = z.object({ language: Language });
const Index = z.coerce.number().int().min(0).max(99);

/** The short lines the web app plays while the tutor prepares an answer. */
@Controller("voice/fillers")
export class FillersController {
  constructor(private readonly fillers: FillerSpeechService) {}

  @Get()
  count(@Query() query: unknown) {
    const { language } = parse(LanguageQuery, query);
    return { count: this.fillers.count(language) };
  }

  @Get(":index")
  async speech(@Param("index") index: string, @Query() query: unknown, @Res() res: Response) {
    const { language } = parse(LanguageQuery, query);
    const wav = await this.fillers.speech(language, parse(Index, index));
    res.type("audio/wav").set("cache-control", "private, max-age=86400").send(wav);
  }
}

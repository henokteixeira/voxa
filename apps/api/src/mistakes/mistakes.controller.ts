import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { MistakeBankService } from "../application/mistake-bank.service.js";
import { Language, parse } from "../common/http.js";
import { DISMISS_REASONS } from "../domain/ports/mistake-bank.repository.js";

const ListQuery = z.object({ language: Language });
const DismissBody = z.object({ reason: z.enum(DISMISS_REASONS) });
const MistakeId = z.uuid();

@Controller("mistakes")
export class MistakesController {
  constructor(private readonly bank: MistakeBankService) {}

  @Get()
  async list(@Query() query: unknown) {
    const { language } = parse(ListQuery, query);
    return { mistakes: await this.bank.list(language) };
  }

  @Post(":id/dismiss")
  @HttpCode(204)
  async dismiss(@Param("id") id: string, @Body() body: unknown) {
    const mistakeId = parse(MistakeId, id);
    const { reason } = parse(DismissBody, body);
    await this.bank.dismiss(mistakeId, reason);
  }
}

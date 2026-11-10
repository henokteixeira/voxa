import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { DismissMistakeBody } from "@voxa/contracts";
import { z } from "zod";
import { MistakeBankService } from "../application/mistake-bank.service.js";
import { Language, parse } from "../common/http.js";

const ListQuery = z.object({ language: Language });
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
    const { reason } = parse(DismissMistakeBody, body);
    await this.bank.dismiss(mistakeId, reason);
  }
}

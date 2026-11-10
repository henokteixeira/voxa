import { Body, Controller, Delete, Get, HttpCode, Param, Patch } from "@nestjs/common";
import { EditFactBody } from "@voxa/contracts";
import { z } from "zod";
import { LearnerMemoryService } from "../application/learner-memory.service.js";
import { parse } from "../common/http.js";
import type { LearnerFact } from "../domain/memory/learner-fact.js";

const FactId = z.uuid();

const view = ({ id, topic, statement, learnedAt, updatedAt }: LearnerFact) => ({ id, topic, statement, learnedAt, updatedAt });

/** What Voxa knows about the learner: they can read, rewrite and delete every fact. */
@Controller("memory/facts")
export class MemoryController {
  constructor(private readonly memory: LearnerMemoryService) {}

  @Get()
  async list() {
    return { facts: (await this.memory.facts()).map(view) };
  }

  @Patch(":id")
  async edit(@Param("id") id: string, @Body() body: unknown) {
    const { statement } = parse(EditFactBody, body);
    return view(await this.memory.editFact(parse(FactId, id), statement));
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    await this.memory.deleteFact(parse(FactId, id));
  }
}

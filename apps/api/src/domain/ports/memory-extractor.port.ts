import type { ChatTurn } from "../conversation/types.js";
import type { Mode } from "../conversation/mode.js";
import type { LearnerFact, SessionMemory } from "../memory/learner-fact.js";

/** Reads an ended session and finds what the learner said about themselves. Implementations live in infra/. */
export interface MemoryExtractorPort {
  extract(input: { language: string; mode: Mode; turns: ChatTurn[]; known: LearnerFact[] }): Promise<SessionMemory>;
}

export const MEMORY_EXTRACTOR_PORT = Symbol("MEMORY_EXTRACTOR_PORT");

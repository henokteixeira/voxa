import { DomainError } from "../errors.js";

export class MissionNotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(id: string) {
    super(`Mission ${id} not found.`, "Mission not found.");
  }
}

export class MissionExpressionNotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(missionId: string, expressionId: string) {
    super(`Mission ${missionId} has no expression ${expressionId}.`, "That expression is not in this mission.");
  }
}

/** Stable, machine-readable codes for expected failures. Clients branch on these, never on messages. */
export const ERROR_CODES = ["invalid", "not_found", "ended", "bad_audio", "tutor_unavailable", "voice_unavailable", "conflict"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * An expected failure of a use case: bad input, a missing record, a provider that is down.
 *
 * `message` is the detail for logs and may name ids or provider errors; `publicMessage` is safe to show
 * the learner. Transports (HTTP, the voice socket) map `code` to their own status. Any other thrown
 * error is a bug and is reported as an internal error.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;

  constructor(
    message: string,
    readonly publicMessage: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Input that does not match what the use case accepts. */
export class InvalidInputError extends DomainError {
  readonly code = "invalid";

  constructor(detail: string) {
    super(`Invalid input: ${detail}`, detail);
  }
}

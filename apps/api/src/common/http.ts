import { z } from "zod";
import { InvalidInputError } from "../domain/errors.js";
import { isTimeZone } from "../domain/progress/daily-goal.js";

/** An IANA time zone (e.g. "America/Sao_Paulo"): days, the goal and the streak follow the learner's clock. */
export const TimeZone = z.string().max(64).refine(isTimeZone, "Unknown time zone.");

/** A BCP 47 language tag, e.g. "en" or "en-US". English when missing. */
export { Language } from "@voxa/contracts";

/** Validates request input; a mismatch is an InvalidInputError, answered with 400. */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new InvalidInputError(z.prettifyError(result.error));
  return result.data;
}

/**
 * Reads a request's raw body (for audio, which no body parser handles). Bodies over `maxBytes` are refused
 * as soon as they pass the limit; the rest is drained so the client still gets the answer.
 */
export async function readRawBody(
  stream: AsyncIterable<Buffer | string> & { resume(): unknown },
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > maxBytes) {
      stream.resume();
      throw new InvalidInputError(`The body is over ${maxBytes} bytes.`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

import { z } from "zod";
import { InvalidInputError } from "../domain/errors.js";

/** A BCP 47 language tag, e.g. "en" or "en-US". English when missing. */
export const Language = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
  .default("en");

/** Validates request input; a mismatch is an InvalidInputError, answered with 400. */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new InvalidInputError(z.prettifyError(result.error));
  return result.data;
}

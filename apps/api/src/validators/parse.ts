import { z } from "zod";
import { badRequest } from "../errors.js";

/** Every request body/query goes through this — never trust the frontend
 * directly (spec section 25). Converts Zod failures into a 400 AppError
 * with a stable VALIDATION_ERROR code instead of leaking a raw stack. */
export function parseWith<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest("VALIDATION_ERROR", result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
}

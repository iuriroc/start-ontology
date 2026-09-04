import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const capabilityCreateSchema = z.object({
  ...baseCreateFields,
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]*$/, "code must be UPPER_SNAKE_CASE")
    .max(100)
    .optional()
});
export type CapabilityCreateInput = z.infer<typeof capabilityCreateSchema>;

export const capabilityUpdateSchema = capabilityCreateSchema.partial();
export type CapabilityUpdateInput = z.infer<typeof capabilityUpdateSchema>;

export const capabilitySchema = z.object({
  ...baseRecordFields,
  code: z.string()
});
export type Capability = z.infer<typeof capabilitySchema>;

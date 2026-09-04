import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const policyEffectSchema = z.enum(["ALLOW", "DENY"]);

export const policyCreateSchema = z.object({
  ...baseCreateFields,
  effect: policyEffectSchema,
  conditions: z.string().max(2000).optional(),
  priority: z.number().int().min(0).max(1000).default(0)
});
export type PolicyCreateInput = z.infer<typeof policyCreateSchema>;

export const policyUpdateSchema = policyCreateSchema.partial();
export type PolicyUpdateInput = z.infer<typeof policyUpdateSchema>;

export const policySchema = z.object({
  ...baseRecordFields,
  effect: policyEffectSchema,
  conditions: z.string().optional(),
  priority: z.number()
});
export type Policy = z.infer<typeof policySchema>;

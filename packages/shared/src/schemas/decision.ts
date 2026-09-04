import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const decisionCreateSchema = z.object({
  ...baseCreateFields,
  reason: z.string().max(2000).optional()
});
export type DecisionCreateInput = z.infer<typeof decisionCreateSchema>;

export const decisionUpdateSchema = decisionCreateSchema.partial();
export type DecisionUpdateInput = z.infer<typeof decisionUpdateSchema>;

export const decisionSchema = z.object({
  ...baseRecordFields,
  reason: z.string().optional()
});
export type Decision = z.infer<typeof decisionSchema>;

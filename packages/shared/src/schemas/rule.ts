import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const ruleCreateSchema = z.object({
  ...baseCreateFields,
  condition: z.string().trim().min(1).max(2000),
  action: z.string().trim().min(1).max(2000),
  priority: z.number().int().min(0).max(1000).default(0)
});
export type RuleCreateInput = z.infer<typeof ruleCreateSchema>;

export const ruleUpdateSchema = ruleCreateSchema.partial();
export type RuleUpdateInput = z.infer<typeof ruleUpdateSchema>;

export const ruleSchema = z.object({
  ...baseRecordFields,
  condition: z.string(),
  action: z.string(),
  priority: z.number()
});
export type Rule = z.infer<typeof ruleSchema>;

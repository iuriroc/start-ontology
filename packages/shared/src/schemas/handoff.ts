import { z } from "zod";
import { baseCreateFields, baseRecordFields, idSchema } from "./common.js";

export const handoffCreateSchema = z.object({
  ...baseCreateFields,
  fromAgentId: idSchema,
  toAgentId: idSchema,
  reason: z.string().max(1000).optional(),
  condition: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(1000).default(0)
});
export type HandoffCreateInput = z.infer<typeof handoffCreateSchema>;

export const handoffUpdateSchema = handoffCreateSchema
  .omit({ fromAgentId: true, toAgentId: true })
  .partial();
export type HandoffUpdateInput = z.infer<typeof handoffUpdateSchema>;

export const handoffSchema = z.object({
  ...baseRecordFields,
  fromAgentId: idSchema,
  toAgentId: idSchema,
  reason: z.string().optional(),
  condition: z.string().optional(),
  priority: z.number()
});
export type Handoff = z.infer<typeof handoffSchema>;

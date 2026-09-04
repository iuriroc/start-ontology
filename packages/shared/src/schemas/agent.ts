import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const agentCreateSchema = z.object({
  ...baseCreateFields,
  role: z.string().trim().min(1).max(150)
});
export type AgentCreateInput = z.infer<typeof agentCreateSchema>;

export const agentUpdateSchema = agentCreateSchema.partial();
export type AgentUpdateInput = z.infer<typeof agentUpdateSchema>;

export const agentSchema = z.object({
  ...baseRecordFields,
  role: z.string()
});
export type Agent = z.infer<typeof agentSchema>;

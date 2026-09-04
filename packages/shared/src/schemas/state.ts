import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const stateCreateSchema = z.object({
  ...baseCreateFields,
  initial: z.boolean().default(false),
  final: z.boolean().default(false)
});
export type StateCreateInput = z.infer<typeof stateCreateSchema>;

export const stateUpdateSchema = stateCreateSchema.partial();
export type StateUpdateInput = z.infer<typeof stateUpdateSchema>;

export const stateSchema = z.object({
  ...baseRecordFields,
  initial: z.boolean(),
  final: z.boolean()
});
export type State = z.infer<typeof stateSchema>;

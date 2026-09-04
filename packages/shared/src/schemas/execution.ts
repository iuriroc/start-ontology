import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const executionStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED"
]);

export const executionCreateSchema = z.object({
  ...baseCreateFields,
  executionStatus: executionStatusSchema.default("PENDING"),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional()
});
export type ExecutionCreateInput = z.infer<typeof executionCreateSchema>;

export const executionUpdateSchema = executionCreateSchema.partial();
export type ExecutionUpdateInput = z.infer<typeof executionUpdateSchema>;

export const executionSchema = z.object({
  ...baseRecordFields,
  executionStatus: executionStatusSchema,
  startedAt: z.string().optional(),
  finishedAt: z.string().optional()
});
export type Execution = z.infer<typeof executionSchema>;

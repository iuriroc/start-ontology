import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const learningEventCreateSchema = z.object({
  ...baseCreateFields,
  type: z.string().trim().min(1).max(150),
  source: z.string().trim().min(1).max(150),
  result: z.string().max(2000).optional()
});
export type LearningEventCreateInput = z.infer<typeof learningEventCreateSchema>;

export const learningEventUpdateSchema = learningEventCreateSchema.partial();
export type LearningEventUpdateInput = z.infer<typeof learningEventUpdateSchema>;

export const learningEventSchema = z.object({
  ...baseRecordFields,
  type: z.string(),
  source: z.string(),
  result: z.string().optional()
});
export type LearningEvent = z.infer<typeof learningEventSchema>;

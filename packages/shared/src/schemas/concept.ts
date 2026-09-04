import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const conceptCreateSchema = z.object({ ...baseCreateFields });
export type ConceptCreateInput = z.infer<typeof conceptCreateSchema>;

export const conceptUpdateSchema = conceptCreateSchema.partial();
export type ConceptUpdateInput = z.infer<typeof conceptUpdateSchema>;

export const conceptSchema = z.object({ ...baseRecordFields });
export type Concept = z.infer<typeof conceptSchema>;

import { z } from "zod";
import { baseCreateFields, baseRecordFields, idSchema } from "./common.js";
import { RELATABLE_LABELS, cardinalitySchema, relationshipTypeSchema } from "./labels.js";

const relatableLabelSchema = z.enum(
  RELATABLE_LABELS as [string, ...string[]]
);

export const relationshipCreateSchema = z.object({
  ...baseCreateFields,
  type: relationshipTypeSchema,
  sourceLabel: relatableLabelSchema,
  sourceId: idSchema,
  targetLabel: relatableLabelSchema,
  targetId: idSchema,
  cardinality: cardinalitySchema.default("MANY_TO_MANY")
});
export type RelationshipCreateInput = z.infer<typeof relationshipCreateSchema>;

export const relationshipUpdateSchema = relationshipCreateSchema
  .omit({ sourceLabel: true, sourceId: true, targetLabel: true, targetId: true, type: true })
  .partial();
export type RelationshipUpdateInput = z.infer<typeof relationshipUpdateSchema>;

export const relationshipSchema = z.object({
  ...baseRecordFields,
  type: z.string(),
  sourceLabel: relatableLabelSchema,
  sourceId: idSchema,
  targetLabel: relatableLabelSchema,
  targetId: idSchema,
  cardinality: cardinalitySchema
});
export type RelationshipDefinition = z.infer<typeof relationshipSchema>;

import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const PropertyType = z.enum([
  "STRING",
  "INTEGER",
  "FLOAT",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "UUID",
  "JSON"
]);
export type PropertyType = z.infer<typeof PropertyType>;

export const entityPropertySchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: PropertyType,
  required: z.boolean().default(false),
  description: z.string().max(500).optional()
});
export type EntityProperty = z.infer<typeof entityPropertySchema>;

export const entityCreateSchema = z.object({
  ...baseCreateFields,
  domain: z.string().trim().max(150).optional(),
  properties: z.array(entityPropertySchema).max(200).optional().default([])
});
export type EntityCreateInput = z.infer<typeof entityCreateSchema>;

export const entityUpdateSchema = entityCreateSchema.partial();
export type EntityUpdateInput = z.infer<typeof entityUpdateSchema>;

export const entitySchema = z.object({
  ...baseRecordFields,
  domain: z.string().optional(),
  properties: z.array(entityPropertySchema).default([])
});
export type Entity = z.infer<typeof entitySchema>;

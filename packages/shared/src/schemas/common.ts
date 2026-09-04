import { z } from "zod";

export const ElementStatus = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export type ElementStatus = z.infer<typeof ElementStatus>;

export const VersionStatus = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type VersionStatus = z.infer<typeof VersionStatus>;

export const idSchema = z.string().uuid();
export const nameSchema = z.string().trim().min(1).max(150);
export const descriptionSchema = z.string().max(2000).optional();
export const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, "version must follow semver, e.g. 1.0.0");

// Fields present on every persisted ontology element (section 6 of the spec).
export const baseRecordFields = {
  id: idSchema,
  name: nameSchema,
  description: descriptionSchema,
  status: ElementStatus,
  version: semverSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
};

export const baseCreateFields = {
  name: nameSchema,
  description: descriptionSchema,
  status: ElementStatus.optional().default("DRAFT")
};

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
  status: ElementStatus.optional(),
  domain: z.string().max(150).optional()
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});

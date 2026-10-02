import { z } from "zod";
import { descriptionSchema, idSchema, nameSchema } from "./common.js";

export const BusinessStatus = z.enum(["ACTIVE", "ARCHIVED"]);
export type BusinessStatus = z.infer<typeof BusinessStatus>;

export const businessSlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "slug: letras minúsculas, números e hífen (até 63 caracteres)");

/** Per-business runtime settings read by the harness. */
export const businessSettingsSchema = z
  .object({
    /** host[:port] values the http tool executor may call. Empty = no outbound calls. */
    allowedHosts: z.array(z.string().trim().min(1).max(255)).max(100).default([]),
    /** Extra keys redacted from persisted call args/context (case-insensitive substring match). */
    sensitiveKeys: z.array(z.string().trim().min(1).max(100)).max(100).default([])
  })
  .passthrough();
export type BusinessSettings = z.infer<typeof businessSettingsSchema>;

export const businessCreateSchema = z.object({
  name: nameSchema,
  slug: businessSlugSchema.optional(),
  description: descriptionSchema,
  settings: businessSettingsSchema.optional()
});
export type BusinessCreateInput = z.infer<typeof businessCreateSchema>;

export const businessUpdateSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema,
  status: BusinessStatus.optional(),
  settings: businessSettingsSchema.optional()
});
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;

export const businessCloneSchema = z.object({
  sourceBusinessId: idSchema
});
export type BusinessCloneInput = z.infer<typeof businessCloneSchema>;

export interface Business {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: BusinessStatus;
  settings: BusinessSettings;
  createdAt: string;
  updatedAt: string;
}

/** Header every tenant-scoped request must send: a business id or slug. */
export const BUSINESS_HEADER = "x-business-id";

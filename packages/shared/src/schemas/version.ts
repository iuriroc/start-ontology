import { z } from "zod";
import { VersionStatus, descriptionSchema, idSchema, semverSchema } from "./common.js";
import { ONTOLOGY_LABELS, OntologyLabel } from "./labels.js";

export const versionCreateSchema = z.object({
  version: semverSchema,
  description: descriptionSchema,
  createdBy: z.string().trim().min(1).max(150).default("system")
});
export type VersionCreateInput = z.infer<typeof versionCreateSchema>;

export const versionSchema = z.object({
  id: idSchema,
  version: semverSchema,
  description: descriptionSchema,
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  status: VersionStatus
});
export type OntologyVersion = z.infer<typeof versionSchema>;

export const attachToVersionSchema = z.object({
  label: OntologyLabel.refine((l) => (ONTOLOGY_LABELS as readonly string[]).includes(l)),
  elementId: idSchema
});
export type AttachToVersionInput = z.infer<typeof attachToVersionSchema>;

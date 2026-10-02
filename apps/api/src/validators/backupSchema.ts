import { z } from "zod";
import {
  agentSchema,
  capabilitySchema,
  conceptSchema,
  decisionSchema,
  entitySchema,
  executionSchema,
  handoffSchema,
  issueSchema,
  learningEventSchema,
  OntologyLabel,
  policySchema,
  relationshipSchema,
  ruleSchema,
  stateSchema,
  versionSchema
} from "@ontology-builder/shared";

export const manifestSchema = z.object({
  format: z.literal("ontology-backup"),
  formatVersion: z.literal("1.0"),
  ontologyVersion: z.string().nullable(),
  business: z.object({ id: z.string(), slug: z.string() }).optional(),
  createdAt: z.string(),
  nodeCount: z.number(),
  relationshipCount: z.number(),
  checksum: z.string().min(1)
});
export type BackupManifest = z.infer<typeof manifestSchema>;

export const ontologySnapshotSchema = z.object({
  metadata: z.object({
    name: z.string(),
    version: z.string().nullable(),
    createdAt: z.string()
  }),
  entities: z.array(entitySchema),
  concepts: z.array(conceptSchema),
  relationships: z.array(relationshipSchema),
  rules: z.array(ruleSchema),
  states: z.array(stateSchema),
  capabilities: z.array(capabilitySchema),
  agents: z.array(agentSchema),
  policies: z.array(policySchema),
  issues: z.array(issueSchema),
  handoffs: z.array(handoffSchema),
  decisions: z.array(decisionSchema),
  executions: z.array(executionSchema),
  learningEvents: z.array(learningEventSchema),
  versions: z.array(versionSchema),
  versionContents: z.array(
    z.object({
      versionId: z.string().uuid(),
      label: OntologyLabel,
      elementId: z.string().uuid()
    })
  )
});
export type OntologySnapshot = z.infer<typeof ontologySnapshotSchema>;

export const restoreRequestSchema = z.object({
  mode: z.enum(["merge", "replace"]),
  confirmReplace: z.boolean().optional().default(false)
});

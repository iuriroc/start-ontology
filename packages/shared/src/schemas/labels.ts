import { z } from "zod";

/**
 * Every Neo4j label the system will ever write. This is the single allowlist
 * consulted anywhere a label is interpolated into a Cypher string — labels
 * cannot be parameterized by the driver, so only values from this list may
 * ever reach a query.
 */
export const ONTOLOGY_LABELS = [
  "Entity",
  "Concept",
  "RelationshipDefinition",
  "Rule",
  "State",
  "Capability",
  "Agent",
  "Policy",
  "Issue",
  "Handoff",
  "Decision",
  "Execution",
  "LearningEvent",
  "OntologyVersion"
] as const;

export const OntologyLabel = z.enum(ONTOLOGY_LABELS);
export type OntologyLabel = z.infer<typeof OntologyLabel>;

/** Labels that can be the endpoint of a user-defined Relationship. */
export const RELATABLE_LABELS = ONTOLOGY_LABELS.filter(
  (l) => l !== "OntologyVersion"
) as Exclude<OntologyLabel, "OntologyVersion">[];

const RELATIONSHIP_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Fixed, reserved relationship types created implicitly by the system (not user editable). */
export const SYSTEM_RELATIONSHIP_TYPES = [
  "CONTAINS",
  "FROM_AGENT",
  "TO_AGENT"
] as const;

/**
 * Normalizes a free-form relationship name into a safe Cypher relationship
 * type: UPPER_SNAKE_CASE, [A-Z0-9_] only, starting with a letter. Throws if
 * the result cannot satisfy the pattern after normalization, so nothing
 * that fails validation ever reaches a Cypher string.
 */
export function normalizeRelationshipType(input: string): string {
  const normalized = input
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");

  if (!RELATIONSHIP_TYPE_PATTERN.test(normalized)) {
    throw new Error(
      "relationship type must normalize to an UPPER_SNAKE_CASE identifier " +
        "starting with a letter (A-Z, 0-9, _ only, max 64 chars)"
    );
  }
  return normalized;
}

export const relationshipTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(150)
  .transform((val, ctx) => {
    try {
      return normalizeRelationshipType(val);
    } catch (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (err as Error).message });
      return z.NEVER;
    }
  });

export const cardinalitySchema = z.enum([
  "ONE_TO_ONE",
  "ONE_TO_MANY",
  "MANY_TO_ONE",
  "MANY_TO_MANY"
]);
export type Cardinality = z.infer<typeof cardinalitySchema>;

import { ONTOLOGY_LABELS } from "@ontology-builder/shared";
import { runQuery } from "../postgres/transaction.js";

export type IssueSeverity = "WARNING" | "ERROR";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  elementIds: string[];
}

export interface ValidationResult {
  status: "VALID" | "WARNING" | "ERROR";
  issues: ValidationIssue[];
}

/**
 * Structural checks against the live graph (spec section 43). Pure read —
 * never mutates. Anything creation-time validation already prevents (e.g. a
 * Rule with no condition) is re-checked here too, as defense in depth for
 * data that arrived via restore rather than the API. BROKEN_RELATIONSHIP_*
 * can no longer actually fire in practice — ontology_edges.source_id/
 * target_id are foreign keys into ontology_nodes, so a dangling reference
 * can't be persisted — but the checks stay as a documented invariant.
 */
export async function validateOntology(): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  for (const label of ONTOLOGY_LABELS) {
    if (label === "OntologyVersion") continue;
    const result = await runQuery<{ name: string; ids: string[] }>(
      undefined,
      `SELECT name, array_agg(id) AS ids FROM ontology_nodes
       WHERE label = $1 GROUP BY name HAVING count(*) > 1`,
      [label]
    );
    for (const row of result.rows) {
      issues.push({
        severity: "WARNING",
        code: "DUPLICATE_NAME",
        message: `${label} name "${row.name}" is used by ${row.ids.length} elements`,
        elementIds: row.ids
      });
    }
  }

  // Confirmed behaviour: only real domain edges count — an Entity that only
  // belongs to an OntologyVersion (via version_contents) still counts as
  // "without relationship" here.
  const orphanEntities = await runQuery<{ id: string; name: string }>(
    undefined,
    `SELECT n.id, n.name FROM ontology_nodes n
     WHERE n.label = 'Entity'
     AND NOT EXISTS (SELECT 1 FROM ontology_edges e WHERE e.source_id = n.id OR e.target_id = n.id)`
  );
  for (const row of orphanEntities.rows) {
    issues.push({
      severity: "WARNING",
      code: "ENTITY_WITHOUT_RELATIONSHIP",
      message: `Entity "${row.name}" has no relationships`,
      elementIds: [row.id]
    });
  }

  const brokenSource = await runQuery<{ id: string; name: string }>(
    undefined,
    `SELECT rd.id, rd.name FROM ontology_nodes rd
     JOIN ontology_edges e ON e.relationship_definition_id = rd.id
     LEFT JOIN ontology_nodes src ON src.id = e.source_id AND src.label = rd.data->>'sourceLabel'
     WHERE rd.label = 'RelationshipDefinition' AND src.id IS NULL`
  );
  for (const row of brokenSource.rows) {
    issues.push({
      severity: "ERROR",
      code: "BROKEN_RELATIONSHIP_SOURCE",
      message: `Relationship "${row.name}" points to a source element that no longer exists`,
      elementIds: [row.id]
    });
  }

  const brokenTarget = await runQuery<{ id: string; name: string }>(
    undefined,
    `SELECT rd.id, rd.name FROM ontology_nodes rd
     JOIN ontology_edges e ON e.relationship_definition_id = rd.id
     LEFT JOIN ontology_nodes tgt ON tgt.id = e.target_id AND tgt.label = rd.data->>'targetLabel'
     WHERE rd.label = 'RelationshipDefinition' AND tgt.id IS NULL`
  );
  for (const row of brokenTarget.rows) {
    issues.push({
      severity: "ERROR",
      code: "BROKEN_RELATIONSHIP_TARGET",
      message: `Relationship "${row.name}" points to a target element that no longer exists`,
      elementIds: [row.id]
    });
  }

  const duplicateRelationships = await runQuery<{ type: string; ids: string[] }>(
    undefined,
    `SELECT type, array_agg(relationship_definition_id) AS ids FROM ontology_edges
     WHERE relationship_definition_id IS NOT NULL
     GROUP BY source_id, target_id, type HAVING count(*) > 1`
  );
  for (const row of duplicateRelationships.rows) {
    issues.push({
      severity: "WARNING",
      code: "DUPLICATE_RELATIONSHIP",
      message: `${row.ids.length} relationships of type ${row.type} connect the same elements`,
      elementIds: row.ids
    });
  }

  const rulesMissingFields = await runQuery<{ id: string; name: string }>(
    undefined,
    `SELECT id, name FROM ontology_nodes
     WHERE label = 'Rule' AND (
       data->>'condition' IS NULL OR data->>'condition' = '' OR
       data->>'action' IS NULL OR data->>'action' = ''
     )`
  );
  for (const row of rulesMissingFields.rows) {
    issues.push({
      severity: "ERROR",
      code: "RULE_MISSING_CONDITION_OR_ACTION",
      message: `Rule "${row.name}" is missing a condition or an action`,
      elementIds: [row.id]
    });
  }

  const agentsWithoutCapability = await runQuery<{ id: string; name: string }>(
    undefined,
    `SELECT a.id, a.name FROM ontology_nodes a
     WHERE a.label = 'Agent' AND NOT EXISTS (
       SELECT 1 FROM ontology_edges e JOIN ontology_nodes c ON c.id = e.target_id
       WHERE e.source_id = a.id AND e.type = 'HAS_CAPABILITY' AND c.label = 'Capability'
     )`
  );
  for (const row of agentsWithoutCapability.rows) {
    issues.push({
      severity: "WARNING",
      code: "AGENT_WITHOUT_CAPABILITY",
      message: `Agent "${row.name}" has no Capability`,
      elementIds: [row.id]
    });
  }

  const agentsWithoutPolicy = await runQuery<{ id: string; name: string }>(
    undefined,
    `SELECT a.id, a.name FROM ontology_nodes a
     WHERE a.label = 'Agent' AND NOT EXISTS (
       SELECT 1 FROM ontology_edges e JOIN ontology_nodes p ON p.id = e.target_id
       WHERE e.source_id = a.id AND e.type = 'GOVERNED_BY' AND p.label = 'Policy'
     )`
  );
  for (const row of agentsWithoutPolicy.rows) {
    issues.push({
      severity: "WARNING",
      code: "AGENT_WITHOUT_POLICY",
      message: `Agent "${row.name}" has no Policy`,
      elementIds: [row.id]
    });
  }

  const statesWithoutTransition = await runQuery<{ id: string; name: string }>(
    undefined,
    `SELECT s.id, s.name FROM ontology_nodes s
     WHERE s.label = 'State' AND (s.data->>'final')::boolean = false
     AND NOT EXISTS (
       SELECT 1 FROM ontology_edges e
       WHERE (e.source_id = s.id OR e.target_id = s.id) AND e.type = 'TRANSITIONS_TO'
     )`
  );
  for (const row of statesWithoutTransition.rows) {
    issues.push({
      severity: "WARNING",
      code: "STATE_WITHOUT_TRANSITION",
      message: `State "${row.name}" has no transition`,
      elementIds: [row.id]
    });
  }

  const status: ValidationResult["status"] = issues.some((i) => i.severity === "ERROR")
    ? "ERROR"
    : issues.length > 0
      ? "WARNING"
      : "VALID";

  return { status, issues };
}

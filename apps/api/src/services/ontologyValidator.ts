import { ONTOLOGY_LABELS } from "@ontology-builder/shared";
import { getSession } from "../neo4j/driver.js";

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
 * data that arrived via restore rather than the API.
 */
export async function validateOntology(): Promise<ValidationResult> {
  const session = getSession();
  const issues: ValidationIssue[] = [];

  try {
    for (const label of ONTOLOGY_LABELS) {
      if (label === "OntologyVersion") continue;
      const result = await session.run(
        `MATCH (n:${label}) WITH n.name AS name, collect(n.id) AS ids
         WHERE size(ids) > 1
         RETURN name, ids`
      );
      for (const record of result.records) {
        issues.push({
          severity: "WARNING",
          code: "DUPLICATE_NAME",
          message: `${label} name "${record.get("name")}" is used by ${record.get("ids").length} elements`,
          elementIds: record.get("ids")
        });
      }
    }

    const orphanEntities = await session.run(
      `MATCH (e:Entity) WHERE NOT (e)--() RETURN e.id AS id, e.name AS name`
    );
    for (const record of orphanEntities.records) {
      issues.push({
        severity: "WARNING",
        code: "ENTITY_WITHOUT_RELATIONSHIP",
        message: `Entity "${record.get("name")}" has no relationships`,
        elementIds: [record.get("id")]
      });
    }

    const brokenSource = await session.run(
      `MATCH (rd:RelationshipDefinition)
       WHERE NOT EXISTS { MATCH (s) WHERE s.id = rd.sourceId AND rd.sourceLabel IN labels(s) }
       RETURN rd.id AS id, rd.name AS name`
    );
    for (const record of brokenSource.records) {
      issues.push({
        severity: "ERROR",
        code: "BROKEN_RELATIONSHIP_SOURCE",
        message: `Relationship "${record.get("name")}" points to a source element that no longer exists`,
        elementIds: [record.get("id")]
      });
    }

    const brokenTarget = await session.run(
      `MATCH (rd:RelationshipDefinition)
       WHERE NOT EXISTS { MATCH (t) WHERE t.id = rd.targetId AND rd.targetLabel IN labels(t) }
       RETURN rd.id AS id, rd.name AS name`
    );
    for (const record of brokenTarget.records) {
      issues.push({
        severity: "ERROR",
        code: "BROKEN_RELATIONSHIP_TARGET",
        message: `Relationship "${record.get("name")}" points to a target element that no longer exists`,
        elementIds: [record.get("id")]
      });
    }

    const duplicateRelationships = await session.run(
      `MATCH (rd:RelationshipDefinition)
       WITH rd.sourceId AS s, rd.targetId AS t, rd.type AS ty, collect(rd.id) AS ids
       WHERE size(ids) > 1
       RETURN s, t, ty, ids`
    );
    for (const record of duplicateRelationships.records) {
      issues.push({
        severity: "WARNING",
        code: "DUPLICATE_RELATIONSHIP",
        message: `${record.get("ids").length} relationships of type ${record.get("ty")} connect the same elements`,
        elementIds: record.get("ids")
      });
    }

    const rulesMissingFields = await session.run(
      `MATCH (r:Rule)
       WHERE r.condition IS NULL OR r.condition = '' OR r.action IS NULL OR r.action = ''
       RETURN r.id AS id, r.name AS name`
    );
    for (const record of rulesMissingFields.records) {
      issues.push({
        severity: "ERROR",
        code: "RULE_MISSING_CONDITION_OR_ACTION",
        message: `Rule "${record.get("name")}" is missing a condition or an action`,
        elementIds: [record.get("id")]
      });
    }

    const agentsWithoutCapability = await session.run(
      `MATCH (a:Agent) WHERE NOT (a)-[:HAS_CAPABILITY]->(:Capability)
       RETURN a.id AS id, a.name AS name`
    );
    for (const record of agentsWithoutCapability.records) {
      issues.push({
        severity: "WARNING",
        code: "AGENT_WITHOUT_CAPABILITY",
        message: `Agent "${record.get("name")}" has no Capability`,
        elementIds: [record.get("id")]
      });
    }

    const agentsWithoutPolicy = await session.run(
      `MATCH (a:Agent) WHERE NOT (a)-[:GOVERNED_BY]->(:Policy)
       RETURN a.id AS id, a.name AS name`
    );
    for (const record of agentsWithoutPolicy.records) {
      issues.push({
        severity: "WARNING",
        code: "AGENT_WITHOUT_POLICY",
        message: `Agent "${record.get("name")}" has no Policy`,
        elementIds: [record.get("id")]
      });
    }

    const statesWithoutTransition = await session.run(
      `MATCH (s:State) WHERE s.final = false AND NOT (s)-[:TRANSITIONS_TO]-()
       RETURN s.id AS id, s.name AS name`
    );
    for (const record of statesWithoutTransition.records) {
      issues.push({
        severity: "WARNING",
        code: "STATE_WITHOUT_TRANSITION",
        message: `State "${record.get("name")}" has no transition`,
        elementIds: [record.get("id")]
      });
    }

    const status: ValidationResult["status"] = issues.some((i) => i.severity === "ERROR")
      ? "ERROR"
      : issues.length > 0
        ? "WARNING"
        : "VALID";

    return { status, issues };
  } finally {
    await session.close();
  }
}

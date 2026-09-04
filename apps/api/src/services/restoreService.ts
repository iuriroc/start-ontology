import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { ONTOLOGY_LABELS } from "@ontology-builder/shared";
import { badRequest } from "../errors.js";
import { getSession } from "../neo4j/driver.js";
import { serialize, type NodeProps } from "../repositories/nodeRepository.js";
import {
  manifestSchema,
  ontologySnapshotSchema,
  type OntologySnapshot
} from "../validators/backupSchema.js";

export interface RestorePlan {
  snapshot: OntologySnapshot;
}

const JSON_FIELDS_BY_LABEL: Record<string, string[]> = { Entity: ["properties"] };

/**
 * Runs the full validation pipeline from spec section 39 against an
 * uploaded backup zip, stopping at the first failure. Never touches Neo4j —
 * that only happens once `restore()` is called with an already-validated
 * plan and an explicit mode.
 */
export function validateBackupZip(buffer: Buffer): RestorePlan {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw badRequest("INVALID_BACKUP_FILE", "Could not read the uploaded file as a zip archive");
  }

  const manifestEntry = zip.getEntry("manifest.json");
  const ontologyEntry = zip.getEntry("ontology.json");
  if (!manifestEntry || !ontologyEntry) {
    throw badRequest(
      "INVALID_BACKUP_FILE",
      "Backup archive must contain manifest.json and ontology.json"
    );
  }

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(manifestEntry.getData().toString("utf-8"));
  } catch {
    throw badRequest("INVALID_MANIFEST", "manifest.json is not valid JSON");
  }
  const manifestResult = manifestSchema.safeParse(manifestRaw);
  if (!manifestResult.success) {
    throw badRequest("INVALID_MANIFEST", "manifest.json does not match the expected format");
  }
  const manifest = manifestResult.data;

  const ontologyJsonText = ontologyEntry.getData().toString("utf-8");
  const checksum = createHash("sha256").update(ontologyJsonText).digest("hex");
  if (checksum !== manifest.checksum) {
    throw badRequest(
      "CHECKSUM_MISMATCH",
      "ontology.json checksum does not match manifest.json — the archive may be corrupted or tampered with"
    );
  }

  let ontologyRaw: unknown;
  try {
    ontologyRaw = JSON.parse(ontologyJsonText);
  } catch {
    throw badRequest("INVALID_ONTOLOGY_JSON", "ontology.json is not valid JSON");
  }
  const snapshotResult = ontologySnapshotSchema.safeParse(ontologyRaw);
  if (!snapshotResult.success) {
    throw badRequest(
      "SCHEMA_VALIDATION_FAILED",
      `ontology.json failed schema validation: ${snapshotResult.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }
  const snapshot = snapshotResult.data;

  validateIds(snapshot);
  validateRelationshipReferences(snapshot);
  validateVersionReferences(snapshot);

  return { snapshot };
}

function validateIds(snapshot: OntologySnapshot): void {
  const allCollections: NodeProps[][] = [
    snapshot.entities,
    snapshot.concepts,
    snapshot.relationships,
    snapshot.rules,
    snapshot.states,
    snapshot.capabilities,
    snapshot.agents,
    snapshot.policies,
    snapshot.issues,
    snapshot.handoffs,
    snapshot.decisions,
    snapshot.executions,
    snapshot.learningEvents,
    snapshot.versions
  ];
  const seen = new Set<string>();
  for (const collection of allCollections) {
    for (const item of collection) {
      const id = item.id as string;
      if (seen.has(id)) {
        throw badRequest("DUPLICATE_ID", `id ${id} appears more than once in the backup`);
      }
      seen.add(id);
    }
  }
}

function elementIndex(snapshot: OntologySnapshot): Map<string, Set<string>> {
  const byLabel = new Map<string, Set<string>>();
  const add = (label: string, id: string) => {
    if (!byLabel.has(label)) byLabel.set(label, new Set());
    byLabel.get(label)!.add(id);
  };
  for (const label of ONTOLOGY_LABELS) byLabel.set(label, byLabel.get(label) ?? new Set());
  for (const e of snapshot.entities) add("Entity", e.id as string);
  for (const e of snapshot.concepts) add("Concept", e.id as string);
  for (const e of snapshot.relationships) add("RelationshipDefinition", e.id as string);
  for (const e of snapshot.rules) add("Rule", e.id as string);
  for (const e of snapshot.states) add("State", e.id as string);
  for (const e of snapshot.capabilities) add("Capability", e.id as string);
  for (const e of snapshot.agents) add("Agent", e.id as string);
  for (const e of snapshot.policies) add("Policy", e.id as string);
  for (const e of snapshot.issues) add("Issue", e.id as string);
  for (const e of snapshot.handoffs) add("Handoff", e.id as string);
  for (const e of snapshot.decisions) add("Decision", e.id as string);
  for (const e of snapshot.executions) add("Execution", e.id as string);
  for (const e of snapshot.learningEvents) add("LearningEvent", e.id as string);
  for (const e of snapshot.versions) add("OntologyVersion", e.id as string);
  return byLabel;
}

function validateRelationshipReferences(snapshot: OntologySnapshot): void {
  const index = elementIndex(snapshot);
  for (const rel of snapshot.relationships) {
    if (!index.get(rel.sourceLabel)?.has(rel.sourceId)) {
      throw badRequest(
        "BROKEN_RELATIONSHIP_REFERENCE",
        `Relationship ${rel.id} references a missing source ${rel.sourceLabel} ${rel.sourceId}`
      );
    }
    if (!index.get(rel.targetLabel)?.has(rel.targetId)) {
      throw badRequest(
        "BROKEN_RELATIONSHIP_REFERENCE",
        `Relationship ${rel.id} references a missing target ${rel.targetLabel} ${rel.targetId}`
      );
    }
  }
  const agentIds = index.get("Agent")!;
  for (const handoff of snapshot.handoffs) {
    if (!agentIds.has(handoff.fromAgentId) || !agentIds.has(handoff.toAgentId)) {
      throw badRequest(
        "BROKEN_RELATIONSHIP_REFERENCE",
        `Handoff ${handoff.id} references a missing Agent`
      );
    }
  }
}

function validateVersionReferences(snapshot: OntologySnapshot): void {
  const index = elementIndex(snapshot);
  const versionIds = index.get("OntologyVersion")!;
  for (const entry of snapshot.versionContents) {
    if (!versionIds.has(entry.versionId)) {
      throw badRequest("UNKNOWN_VERSION_REFERENCE", `Unknown OntologyVersion ${entry.versionId}`);
    }
    if (!index.get(entry.label)?.has(entry.elementId)) {
      throw badRequest(
        "UNKNOWN_VERSION_REFERENCE",
        `Version ${entry.versionId} references a missing ${entry.label} ${entry.elementId}`
      );
    }
  }
}

async function wipeOntology(): Promise<void> {
  const session = getSession();
  try {
    await session.run(`MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels) DETACH DELETE n`, {
      labels: [...ONTOLOGY_LABELS]
    });
  } finally {
    await session.close();
  }
}

async function upsertNodes(label: string, items: NodeProps[]): Promise<void> {
  if (items.length === 0) return;
  const jsonFields = JSON_FIELDS_BY_LABEL[label] ?? [];
  const session = getSession();
  try {
    for (const item of items) {
      const { id, ...rest } = item;
      await session.run(`MERGE (n:${label} {id: $id}) SET n += $props`, {
        id,
        props: serialize(rest, jsonFields)
      });
    }
  } finally {
    await session.close();
  }
}

/** Writes an already-validated snapshot into Neo4j. `merge` upserts by id
 * (existing data outside the backup is left alone); `replace` first wipes
 * every ontology label, then upserts — never called without the plan
 * having passed validateBackupZip first. */
export async function restore(plan: RestorePlan, mode: "merge" | "replace"): Promise<void> {
  const { snapshot } = plan;
  if (mode === "replace") await wipeOntology();

  await upsertNodes("Entity", snapshot.entities);
  await upsertNodes("Concept", snapshot.concepts);
  await upsertNodes("RelationshipDefinition", snapshot.relationships);
  await upsertNodes("Rule", snapshot.rules);
  await upsertNodes("State", snapshot.states);
  await upsertNodes("Capability", snapshot.capabilities);
  await upsertNodes("Agent", snapshot.agents);
  await upsertNodes("Policy", snapshot.policies);
  await upsertNodes("Issue", snapshot.issues);
  await upsertNodes("Handoff", snapshot.handoffs);
  await upsertNodes("Decision", snapshot.decisions);
  await upsertNodes("Execution", snapshot.executions);
  await upsertNodes("LearningEvent", snapshot.learningEvents);
  await upsertNodes("OntologyVersion", snapshot.versions);

  const session = getSession();
  try {
    for (const rel of snapshot.relationships) {
      await session.run(
        `MATCH (a:${rel.sourceLabel} {id: $sourceId}), (b:${rel.targetLabel} {id: $targetId})
         MERGE (a)-[r:${rel.type} {relationshipDefinitionId: $defId}]->(b)
         SET r.cardinality = $cardinality`,
        {
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          defId: rel.id,
          cardinality: rel.cardinality
        }
      );
    }
    for (const handoff of snapshot.handoffs) {
      await session.run(
        `MATCH (h:Handoff {id: $handoffId}), (from:Agent {id: $fromId}), (to:Agent {id: $toId})
         MERGE (h)-[:FROM_AGENT]->(from)
         MERGE (h)-[:TO_AGENT]->(to)`,
        { handoffId: handoff.id, fromId: handoff.fromAgentId, toId: handoff.toAgentId }
      );
    }
    for (const entry of snapshot.versionContents) {
      await session.run(
        `MATCH (v:OntologyVersion {id: $versionId}), (el:${entry.label} {id: $elementId})
         MERGE (v)-[:CONTAINS]->(el)`,
        { versionId: entry.versionId, elementId: entry.elementId }
      );
    }
  } finally {
    await session.close();
  }
}

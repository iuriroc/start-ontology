import { createHash, randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import type { PoolClient } from "pg";
import { ONTOLOGY_LABELS } from "@ontology-builder/shared";
import { badRequest } from "../errors.js";
import { withTransaction } from "../postgres/transaction.js";
import { splitColumns, type NodeProps } from "../repositories/nodeRepository.js";
import {
  manifestSchema,
  ontologySnapshotSchema,
  type OntologySnapshot
} from "../validators/backupSchema.js";

export interface RestorePlan {
  snapshot: OntologySnapshot;
}

/**
 * Runs the full validation pipeline from spec section 39 against an
 * uploaded backup zip, stopping at the first failure. Never touches Postgres —
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

async function wipeOntology(client: PoolClient): Promise<void> {
  await client.query(`DELETE FROM ontology_nodes`);
  await client.query(`DELETE FROM ontology_versions`);
}

async function upsertNode(client: PoolClient, label: string, item: NodeProps): Promise<void> {
  const { id, createdAt, updatedAt, ...rest } = item;
  const { known, rest: data } = splitColumns(rest);
  await client.query(
    `INSERT INTO ontology_nodes (id, label, name, description, status, domain, version, data, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       label = EXCLUDED.label, name = EXCLUDED.name, description = EXCLUDED.description,
       status = EXCLUDED.status, domain = EXCLUDED.domain, version = EXCLUDED.version,
       data = EXCLUDED.data, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
    [
      id,
      label,
      known.name ?? null,
      known.description ?? null,
      known.status ?? "DRAFT",
      known.domain ?? null,
      known.version ?? "0.1.0",
      JSON.stringify(data),
      createdAt,
      updatedAt
    ]
  );
}

async function upsertVersion(client: PoolClient, item: NodeProps): Promise<void> {
  await client.query(
    `INSERT INTO ontology_versions (id, version, description, created_by, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       version = EXCLUDED.version, description = EXCLUDED.description,
       created_by = EXCLUDED.created_by, status = EXCLUDED.status, created_at = EXCLUDED.created_at`,
    [item.id, item.version, item.description ?? null, item.createdBy ?? null, item.status ?? "DRAFT", item.createdAt]
  );
}

/** Writes an already-validated snapshot into Postgres, inside a single
 * transaction (`merge` upserts by id, existing data outside the backup is
 * left alone; `replace` first wipes every table, then upserts) — never
 * called without the plan having passed validateBackupZip first. */
export async function restore(plan: RestorePlan, mode: "merge" | "replace"): Promise<void> {
  const { snapshot } = plan;
  const nodeCollections: Array<[string, NodeProps[]]> = [
    ["Entity", snapshot.entities],
    ["Concept", snapshot.concepts],
    ["RelationshipDefinition", snapshot.relationships],
    ["Rule", snapshot.rules],
    ["State", snapshot.states],
    ["Capability", snapshot.capabilities],
    ["Agent", snapshot.agents],
    ["Policy", snapshot.policies],
    ["Issue", snapshot.issues],
    ["Handoff", snapshot.handoffs],
    ["Decision", snapshot.decisions],
    ["Execution", snapshot.executions],
    ["LearningEvent", snapshot.learningEvents]
  ];

  await withTransaction(async (client) => {
    if (mode === "replace") await wipeOntology(client);

    for (const [label, items] of nodeCollections) {
      for (const item of items) await upsertNode(client, label, item);
    }
    for (const version of snapshot.versions) await upsertVersion(client, version);

    for (const rel of snapshot.relationships) {
      await client.query(
        `INSERT INTO ontology_edges (id, source_id, target_id, type, relationship_definition_id, cardinality)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (relationship_definition_id) WHERE relationship_definition_id IS NOT NULL
         DO UPDATE SET source_id = EXCLUDED.source_id, target_id = EXCLUDED.target_id,
           type = EXCLUDED.type, cardinality = EXCLUDED.cardinality`,
        [randomUUID(), rel.sourceId, rel.targetId, rel.type, rel.id, rel.cardinality]
      );
    }
    for (const handoff of snapshot.handoffs) {
      await client.query(
        `INSERT INTO ontology_edges (id, source_id, target_id, type) VALUES ($1, $2, $3, 'FROM_AGENT')
         ON CONFLICT (source_id, target_id, type) WHERE relationship_definition_id IS NULL DO NOTHING`,
        [randomUUID(), handoff.id, handoff.fromAgentId]
      );
      await client.query(
        `INSERT INTO ontology_edges (id, source_id, target_id, type) VALUES ($1, $2, $3, 'TO_AGENT')
         ON CONFLICT (source_id, target_id, type) WHERE relationship_definition_id IS NULL DO NOTHING`,
        [randomUUID(), handoff.id, handoff.toAgentId]
      );
    }
    for (const entry of snapshot.versionContents) {
      await client.query(
        `INSERT INTO version_contents (version_id, node_id) VALUES ($1, $2)
         ON CONFLICT (version_id, node_id) DO NOTHING`,
        [entry.versionId, entry.elementId]
      );
    }
  });
}

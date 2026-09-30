import { ONTOLOGY_LABELS } from "@ontology-builder/shared";
import { createNodeRepository, type NodeProps } from "../repositories/nodeRepository.js";
import { versionRepository } from "../repositories/versionRepository.js";
import { runQuery } from "../postgres/transaction.js";

const LARGE_LIMIT = 1_000_000;

const COLLECTION_CONFIG: Array<{ key: string; label: (typeof ONTOLOGY_LABELS)[number] }> = [
  { key: "entities", label: "Entity" },
  { key: "concepts", label: "Concept" },
  { key: "relationships", label: "RelationshipDefinition" },
  { key: "rules", label: "Rule" },
  { key: "states", label: "State" },
  { key: "capabilities", label: "Capability" },
  { key: "agents", label: "Agent" },
  { key: "policies", label: "Policy" },
  { key: "issues", label: "Issue" },
  { key: "handoffs", label: "Handoff" },
  { key: "decisions", label: "Decision" },
  { key: "executions", label: "Execution" },
  { key: "learningEvents", label: "LearningEvent" }
];

export interface OntologySnapshot {
  metadata: {
    name: string;
    version: string | null;
    createdAt: string;
  };
  entities: NodeProps[];
  concepts: NodeProps[];
  relationships: NodeProps[];
  rules: NodeProps[];
  states: NodeProps[];
  capabilities: NodeProps[];
  agents: NodeProps[];
  policies: NodeProps[];
  issues: NodeProps[];
  handoffs: NodeProps[];
  decisions: NodeProps[];
  executions: NodeProps[];
  learningEvents: NodeProps[];
  versions: NodeProps[];
  versionContents: Array<{ versionId: string; label: string; elementId: string }>;
}

/** Reads the entire ontology out of Postgres into a plain structured
 * snapshot (spec section 36). Postgres stays the source of truth — this is
 * a point-in-time export used for backup and, secondarily, for the
 * dashboard/validator's "current state" queries. */
export async function buildOntologySnapshot(): Promise<OntologySnapshot> {
  const collections: Record<string, NodeProps[]> = {};
  for (const config of COLLECTION_CONFIG) {
    const repo = createNodeRepository(config.label);
    collections[config.key] = await repo.list({ limit: LARGE_LIMIT, offset: 0 });
  }

  const versions = await versionRepository.list();
  const versionContents: OntologySnapshot["versionContents"] = [];
  for (const version of versions) {
    const contents = await versionRepository.contents(version.id as string);
    for (const item of contents) {
      versionContents.push({ versionId: version.id as string, label: item.label, elementId: item.id });
    }
  }

  const latestVersion = (versions[0]?.version as string | undefined) ?? null;

  return {
    metadata: {
      name: "Ontology Builder Export",
      version: latestVersion,
      createdAt: new Date().toISOString()
    },
    entities: collections.entities ?? [],
    concepts: collections.concepts ?? [],
    relationships: collections.relationships ?? [],
    rules: collections.rules ?? [],
    states: collections.states ?? [],
    capabilities: collections.capabilities ?? [],
    agents: collections.agents ?? [],
    policies: collections.policies ?? [],
    issues: collections.issues ?? [],
    handoffs: collections.handoffs ?? [],
    decisions: collections.decisions ?? [],
    executions: collections.executions ?? [],
    learningEvents: collections.learningEvents ?? [],
    versions,
    versionContents
  };
}

export async function countAllNodes(): Promise<number> {
  const result = await runQuery<{ c: string }>(undefined, `SELECT count(*) AS c FROM ontology_nodes`);
  return Number(result.rows[0]?.c ?? 0);
}

export async function countAllRelationships(): Promise<number> {
  const result = await runQuery<{ c: string }>(undefined, `SELECT count(*) AS c FROM ontology_edges`);
  return Number(result.rows[0]?.c ?? 0);
}

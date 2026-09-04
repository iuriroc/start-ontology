import { ONTOLOGY_LABELS } from "@ontology-builder/shared";
import { createNodeRepository, type NodeProps } from "../repositories/nodeRepository.js";
import { versionRepository } from "../repositories/versionRepository.js";
import { getSession } from "../neo4j/driver.js";

const LARGE_LIMIT = 1_000_000;

const COLLECTION_CONFIG: Array<{ key: string; label: (typeof ONTOLOGY_LABELS)[number]; jsonFields?: string[] }> = [
  { key: "entities", label: "Entity", jsonFields: ["properties"] },
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

/** Reads the entire ontology out of Neo4j into a plain structured snapshot
 * (spec section 36). Neo4j stays the source of truth — this is a
 * point-in-time export used for backup and, secondarily, for the
 * dashboard/validator's "current state" queries. */
export async function buildOntologySnapshot(): Promise<OntologySnapshot> {
  const collections: Record<string, NodeProps[]> = {};
  for (const config of COLLECTION_CONFIG) {
    const repo = createNodeRepository(config.label, config.jsonFields ?? []);
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
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels) RETURN count(n) AS c`,
      { labels: [...ONTOLOGY_LABELS] }
    );
    return Number(result.records[0]?.get("c") ?? 0);
  } finally {
    await session.close();
  }
}

export async function countAllRelationships(): Promise<number> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (a)-[r]->(b)
       WHERE any(l IN labels(a) WHERE l IN $labels) AND any(l IN labels(b) WHERE l IN $labels)
       RETURN count(r) AS c`,
      { labels: [...ONTOLOGY_LABELS] }
    );
    return Number(result.records[0]?.get("c") ?? 0);
  } finally {
    await session.close();
  }
}

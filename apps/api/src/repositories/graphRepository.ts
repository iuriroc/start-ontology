import { ONTOLOGY_LABELS } from "@ontology-builder/shared";
import { runQuery } from "../postgres/transaction.js";

export interface GraphFilter {
  labels?: string[];
  status?: string;
  domain?: string;
}

export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  relationshipDefinitionId: string | null;
}

const GRAPH_LABELS = ONTOLOGY_LABELS.filter((l) => l !== "OntologyVersion");

export const graphRepository = {
  async getGraph(filter: GraphFilter): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const labels = filter.labels?.length ? filter.labels : [...GRAPH_LABELS];
    const conditions = ["label = ANY($1)"];
    const params: unknown[] = [labels];
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filter.domain) {
      params.push(filter.domain);
      conditions.push(`domain = $${params.length}`);
    }
    const whereClause = conditions.join(" AND ");

    const nodesResult = await runQuery<{
      id: string;
      label: string;
      name: string;
      description: string | null;
      status: string;
      domain: string | null;
      version: string;
      data: Record<string, unknown>;
      created_at: Date;
      updated_at: Date;
    }>(undefined, `SELECT * FROM ontology_nodes WHERE ${whereClause}`, params);

    const nodes: GraphNode[] = nodesResult.rows.map((row) => ({
      id: row.id,
      type: row.label,
      data: {
        id: row.id,
        name: row.name,
        ...(row.description != null ? { description: row.description } : {}),
        status: row.status,
        ...(row.domain != null ? { domain: row.domain } : {}),
        version: row.version,
        ...row.data,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString()
      }
    }));
    const nodeIds = new Set(nodes.map((n) => n.id));

    // Edges are filtered by the source node's label/status/domain only,
    // then both endpoints are checked against the already-fetched node set
    // (mirrors the original Cypher, which only constrained the `a` side).
    const edgeConditions = ["a.label = ANY($1)"];
    const edgeParams: unknown[] = [labels];
    if (filter.status) {
      edgeParams.push(filter.status);
      edgeConditions.push(`a.status = $${edgeParams.length}`);
    }
    if (filter.domain) {
      edgeParams.push(filter.domain);
      edgeConditions.push(`a.domain = $${edgeParams.length}`);
    }
    const edgesResult = await runQuery<{
      id: string;
      source_id: string;
      target_id: string;
      type: string;
      relationship_definition_id: string | null;
    }>(
      undefined,
      `SELECT e.id, e.source_id, e.target_id, e.type, e.relationship_definition_id
       FROM ontology_edges e
       JOIN ontology_nodes a ON a.id = e.source_id
       WHERE ${edgeConditions.join(" AND ")}`,
      edgeParams
    );
    const edges: GraphEdge[] = edgesResult.rows
      .map((row) => ({
        id: row.id,
        source: row.source_id,
        target: row.target_id,
        label: row.type,
        relationshipDefinitionId: row.relationship_definition_id
      }))
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { nodes, edges };
  },

  async getLayout(): Promise<Record<string, { x: number; y: number }>> {
    const result = await runQuery<{ positions: Record<string, { x: number; y: number }> }>(
      undefined,
      `SELECT positions FROM graph_layout WHERE id = 'singleton'`
    );
    return result.rows[0]?.positions ?? {};
  },

  async saveLayout(positions: Record<string, { x: number; y: number }>): Promise<void> {
    await runQuery(
      undefined,
      `INSERT INTO graph_layout (id, positions, updated_at) VALUES ('singleton', $1, now())
       ON CONFLICT (business_id) DO UPDATE SET positions = EXCLUDED.positions, updated_at = now()`,
      [JSON.stringify(positions)]
    );
  },

  async getStats(): Promise<{ counts: Record<string, number>; currentVersion: string | null }> {
    const counts: Record<string, number> = {};
    for (const label of ONTOLOGY_LABELS) counts[label] = 0;

    const countsResult = await runQuery<{ label: string; c: string }>(
      undefined,
      `SELECT label, count(*) AS c FROM ontology_nodes GROUP BY label`
    );
    for (const row of countsResult.rows) counts[row.label] = Number(row.c);

    const versionCountResult = await runQuery<{ c: string }>(
      undefined,
      `SELECT count(*) AS c FROM ontology_versions`
    );
    counts.OntologyVersion = Number(versionCountResult.rows[0]?.c ?? 0);

    const versionResult = await runQuery<{ version: string }>(
      undefined,
      `SELECT version FROM ontology_versions ORDER BY created_at DESC LIMIT 1`
    );
    const currentVersion = versionResult.rows[0]?.version ?? null;
    return { counts, currentVersion };
  }
};

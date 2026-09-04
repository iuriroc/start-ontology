import { ONTOLOGY_LABELS } from "@ontology-builder/shared";
import { getSession } from "../neo4j/driver.js";

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
    const session = getSession();
    try {
      const conditionsFor = (varName: string) => {
        const conditions = [`any(l IN labels(${varName}) WHERE l IN $labels)`];
        if (filter.status) conditions.push(`${varName}.status = $status`);
        if (filter.domain) conditions.push(`${varName}.domain = $domain`);
        return conditions.join(" AND ");
      };
      const params: Record<string, unknown> = { labels };
      if (filter.status) params.status = filter.status;
      if (filter.domain) params.domain = filter.domain;

      const nodesResult = await session.run(
        `MATCH (n) WHERE ${conditionsFor("n")} RETURN n, labels(n) AS labels`,
        params
      );
      const nodes: GraphNode[] = nodesResult.records.map((r) => {
        const props = r.get("n").properties;
        const type = (r.get("labels") as string[])[0] ?? "Unknown";
        return { id: props.id, type, data: props };
      });
      const nodeIds = new Set(nodes.map((n) => n.id));

      const edgesResult = await session.run(
        `MATCH (a)-[r]->(b)
         WHERE ${conditionsFor("a")} AND type(r) <> 'CONTAINS'
         RETURN a.id AS source, b.id AS target, type(r) AS type, elementId(r) AS relId,
                r.relationshipDefinitionId AS relDefId`,
        params
      );
      const edges: GraphEdge[] = edgesResult.records
        .map((r) => ({
          id: r.get("relId") as string,
          source: r.get("source") as string,
          target: r.get("target") as string,
          label: r.get("type") as string,
          relationshipDefinitionId: r.get("relDefId") as string | null
        }))
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

      return { nodes, edges };
    } finally {
      await session.close();
    }
  },

  async getLayout(): Promise<Record<string, { x: number; y: number }>> {
    const session = getSession();
    try {
      const result = await session.run(
        `MATCH (l:GraphLayout {id: 'singleton'}) RETURN l.positions AS positions`
      );
      const raw = result.records[0]?.get("positions");
      return raw ? JSON.parse(raw) : {};
    } finally {
      await session.close();
    }
  },

  async saveLayout(positions: Record<string, { x: number; y: number }>): Promise<void> {
    const session = getSession();
    try {
      await session.run(
        `MERGE (l:GraphLayout {id: 'singleton'}) SET l.positions = $positions`,
        { positions: JSON.stringify(positions) }
      );
    } finally {
      await session.close();
    }
  },

  async getStats(): Promise<{ counts: Record<string, number>; currentVersion: string | null }> {
    const session = getSession();
    try {
      const counts: Record<string, number> = {};
      for (const label of ONTOLOGY_LABELS) {
        const result = await session.run(`MATCH (n:${label}) RETURN count(n) AS c`);
        counts[label] = Number(result.records[0]?.get("c") ?? 0);
      }
      const versionResult = await session.run(
        `MATCH (v:OntologyVersion) RETURN v.version AS version, v.status AS status
         ORDER BY v.createdAt DESC LIMIT 1`
      );
      const currentVersion = versionResult.records[0]?.get("version") ?? null;
      return { counts, currentVersion };
    } finally {
      await session.close();
    }
  }
};

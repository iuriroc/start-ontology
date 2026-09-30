import { randomUUID } from "node:crypto";
import type { VersionCreateInput } from "@ontology-builder/shared";
import { runQuery, type Queryable } from "../postgres/transaction.js";
import type { NodeProps } from "./nodeRepository.js";

interface VersionRow {
  id: string;
  version: string;
  description: string | null;
  created_by: string | null;
  status: string;
  created_at: Date;
}

function fromRow(row: VersionRow): NodeProps {
  return {
    id: row.id,
    version: row.version,
    description: row.description,
    createdBy: row.created_by,
    status: row.status,
    createdAt: row.created_at.toISOString()
  };
}

export const versionRepository = {
  async list(client?: Queryable): Promise<NodeProps[]> {
    const result = await runQuery<VersionRow>(
      client,
      `SELECT * FROM ontology_versions ORDER BY created_at DESC`
    );
    return result.rows.map(fromRow);
  },

  async findById(id: string, client?: Queryable): Promise<NodeProps | null> {
    const result = await runQuery<VersionRow>(client, `SELECT * FROM ontology_versions WHERE id = $1`, [id]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  },

  async create(data: VersionCreateInput, client?: Queryable): Promise<NodeProps> {
    const result = await runQuery<VersionRow>(
      client,
      `INSERT INTO ontology_versions (id, version, description, created_by, status, created_at)
       VALUES ($1, $2, $3, $4, 'DRAFT', now())
       RETURNING *`,
      [randomUUID(), data.version, data.description ?? null, data.createdBy]
    );
    return fromRow(result.rows[0]!);
  },

  async setStatus(
    id: string,
    status: "PUBLISHED" | "ARCHIVED",
    client?: Queryable
  ): Promise<NodeProps | null> {
    const result = await runQuery<VersionRow>(
      client,
      `UPDATE ontology_versions SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  },

  async deleteDraft(id: string, client?: Queryable): Promise<boolean> {
    const result = await runQuery(
      client,
      `DELETE FROM ontology_versions WHERE id = $1 AND status = 'DRAFT'`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  /** Silently does nothing if no node with this id has this label — mirrors
   * the original `MATCH (el:${label} {id}) MERGE (v)-[:CONTAINS]->(el)`,
   * which matches zero rows (and attaches nothing) on a label mismatch. */
  async attach(versionId: string, label: string, elementId: string, client?: Queryable): Promise<void> {
    await runQuery(
      client,
      `INSERT INTO version_contents (version_id, node_id)
       SELECT $1, id FROM ontology_nodes WHERE id = $2 AND label = $3
       ON CONFLICT (version_id, node_id) DO NOTHING`,
      [versionId, elementId, label]
    );
  },

  async contents(
    versionId: string,
    client?: Queryable
  ): Promise<Array<{ label: string; id: string; name: string }>> {
    const result = await runQuery<{ label: string; id: string; name: string }>(
      client,
      `SELECT n.label, n.id, n.name FROM version_contents vc
       JOIN ontology_nodes n ON n.id = vc.node_id
       WHERE vc.version_id = $1`,
      [versionId]
    );
    return result.rows;
  }
};

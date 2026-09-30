import { randomUUID } from "node:crypto";
import type { OntologyLabel } from "@ontology-builder/shared";
import type { QueryResultRow } from "pg";
import { runQuery, type Queryable } from "../postgres/transaction.js";

export interface ListOptions {
  limit: number;
  offset: number;
  status?: string;
  domain?: string;
}

export type NodeProps = Record<string, unknown>;

export const KNOWN_COLUMNS = ["name", "description", "status", "domain", "version"] as const;
export type KnownColumn = (typeof KNOWN_COLUMNS)[number];

/** Splits a flat props object into the columns ontology_nodes has natively
 * and everything else, which is stored in the `data` JSONB column. */
export function splitColumns(data: NodeProps): { known: Partial<Record<KnownColumn, unknown>>; rest: NodeProps } {
  const known: Partial<Record<KnownColumn, unknown>> = {};
  const rest: NodeProps = {};
  for (const [key, value] of Object.entries(data)) {
    if ((KNOWN_COLUMNS as readonly string[]).includes(key)) {
      known[key as KnownColumn] = value;
    } else {
      rest[key] = value;
    }
  }
  return { known, rest };
}

interface NodeRow extends QueryResultRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  domain: string | null;
  version: string;
  data: NodeProps;
  created_at: Date;
  updated_at: Date;
}

function fromRow(row: NodeRow): NodeProps {
  return {
    id: row.id,
    name: row.name,
    ...(row.description != null ? { description: row.description } : {}),
    status: row.status,
    ...(row.domain != null ? { domain: row.domain } : {}),
    version: row.version,
    ...row.data,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

/**
 * label is always a value from the fixed OntologyLabel allowlist and is
 * bound as an ordinary query parameter here (Postgres columns, unlike Neo4j
 * labels, can always be parameterized) — no string interpolation involved.
 */
export function createNodeRepository(label: OntologyLabel) {
  return {
    label,

    async list(opts: ListOptions, client?: Queryable): Promise<NodeProps[]> {
      const conditions = ["label = $1"];
      const params: unknown[] = [label];
      if (opts.status) {
        params.push(opts.status);
        conditions.push(`status = $${params.length}`);
      }
      if (opts.domain) {
        params.push(opts.domain);
        conditions.push(`domain = $${params.length}`);
      }
      params.push(opts.limit, opts.offset);
      const result = await runQuery<NodeRow>(
        client,
        `SELECT * FROM ontology_nodes WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return result.rows.map(fromRow);
    },

    async count(status?: string, client?: Queryable): Promise<number> {
      const conditions = ["label = $1"];
      const params: unknown[] = [label];
      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }
      const result = await runQuery<{ c: string }>(
        client,
        `SELECT count(*) AS c FROM ontology_nodes WHERE ${conditions.join(" AND ")}`,
        params
      );
      return Number(result.rows[0]?.c ?? 0);
    },

    async findById(id: string, client?: Queryable): Promise<NodeProps | null> {
      const result = await runQuery<NodeRow>(
        client,
        `SELECT * FROM ontology_nodes WHERE label = $1 AND id = $2`,
        [label, id]
      );
      return result.rows[0] ? fromRow(result.rows[0]) : null;
    },

    async findByName(name: string, client?: Queryable): Promise<NodeProps | null> {
      const result = await runQuery<NodeRow>(
        client,
        `SELECT * FROM ontology_nodes WHERE label = $1 AND name = $2 LIMIT 1`,
        [label, name]
      );
      return result.rows[0] ? fromRow(result.rows[0]) : null;
    },

    async create(data: NodeProps, client?: Queryable): Promise<NodeProps> {
      const id = randomUUID();
      const now = new Date();
      const { known, rest } = splitColumns(data);
      const result = await runQuery<NodeRow>(
        client,
        `INSERT INTO ontology_nodes (id, label, name, description, status, domain, version, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         RETURNING *`,
        [
          id,
          label,
          known.name ?? null,
          known.description ?? null,
          known.status ?? "DRAFT",
          known.domain ?? null,
          known.version ?? "0.1.0",
          JSON.stringify(rest),
          now
        ]
      );
      return fromRow(result.rows[0]!);
    },

    async update(id: string, data: NodeProps, client?: Queryable): Promise<NodeProps | null> {
      const { known, rest } = splitColumns(data);
      const setClauses: string[] = [];
      const params: unknown[] = [];
      for (const [column, value] of Object.entries(known)) {
        params.push(value);
        setClauses.push(`${column} = $${params.length}`);
      }
      params.push(JSON.stringify(rest));
      setClauses.push(`data = data || $${params.length}::jsonb`);
      params.push(new Date());
      setClauses.push(`updated_at = $${params.length}`);
      params.push(label, id);

      const result = await runQuery<NodeRow>(
        client,
        `UPDATE ontology_nodes SET ${setClauses.join(", ")}
         WHERE label = $${params.length - 1} AND id = $${params.length}
         RETURNING *`,
        params
      );
      return result.rows[0] ? fromRow(result.rows[0]) : null;
    },

    async hardDelete(id: string, client?: Queryable): Promise<void> {
      await runQuery(client, `DELETE FROM ontology_nodes WHERE label = $1 AND id = $2`, [label, id]);
    },

    /** Any real graph edge touching this node, plus version membership —
     * both currently block a hard delete with a 409. */
    async relationshipCount(id: string, client?: Queryable): Promise<number> {
      const result = await runQuery<{ c: string }>(
        client,
        `SELECT
           (SELECT count(*) FROM ontology_edges WHERE source_id = $1 OR target_id = $1) +
           (SELECT count(*) FROM version_contents WHERE node_id = $1) AS c`,
        [id]
      );
      return Number(result.rows[0]?.c ?? 0);
    }
  };
}

export type NodeRepository = ReturnType<typeof createNodeRepository>;

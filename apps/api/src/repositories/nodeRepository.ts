import { randomUUID } from "node:crypto";
import type { OntologyLabel } from "@ontology-builder/shared";
import { getSession } from "../neo4j/driver.js";

export interface ListOptions {
  limit: number;
  offset: number;
  status?: string;
  domain?: string;
}

export type NodeProps = Record<string, unknown>;

/**
 * Neo4j node properties must be primitives or arrays of primitives — they
 * cannot hold nested objects (e.g. Entity.properties, an array of {name,
 * type, required, description}). jsonFields lists which top-level fields
 * on this label need JSON (de)serialization on the way in/out.
 */
export function serialize(data: NodeProps, jsonFields: string[]): NodeProps {
  const out: NodeProps = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = jsonFields.includes(key) ? JSON.stringify(value ?? []) : value;
  }
  return out;
}

export function deserialize(props: NodeProps, jsonFields: string[]): NodeProps {
  const out: NodeProps = { ...props };
  for (const field of jsonFields) {
    if (typeof out[field] === "string") {
      try {
        out[field] = JSON.parse(out[field] as string);
      } catch {
        out[field] = [];
      }
    }
  }
  return out;
}

/**
 * label is always a value from the fixed OntologyLabel allowlist (never
 * user input), so interpolating it into Cypher is safe — labels cannot be
 * parameterized by the driver.
 */
export function createNodeRepository(label: OntologyLabel, jsonFields: string[] = []) {
  return {
    label,

    async list(opts: ListOptions): Promise<NodeProps[]> {
      const session = getSession();
      try {
        const where: string[] = [];
        const params: NodeProps = { limit: opts.limit, offset: opts.offset };
        if (opts.status) {
          where.push("n.status = $status");
          params.status = opts.status;
        }
        if (opts.domain) {
          where.push("n.domain = $domain");
          params.domain = opts.domain;
        }
        const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const result = await session.run(
          `MATCH (n:${label}) ${whereClause}
           RETURN n ORDER BY n.createdAt DESC
           SKIP $offset LIMIT $limit`,
          params
        );
        return result.records.map((r) => deserialize(r.get("n").properties, jsonFields));
      } finally {
        await session.close();
      }
    },

    async count(status?: string): Promise<number> {
      const session = getSession();
      try {
        const result = await session.run(
          `MATCH (n:${label}) ${status ? "WHERE n.status = $status" : ""} RETURN count(n) AS c`,
          status ? { status } : {}
        );
        return Number(result.records[0]?.get("c") ?? 0);
      } finally {
        await session.close();
      }
    },

    async findById(id: string): Promise<NodeProps | null> {
      const session = getSession();
      try {
        const result = await session.run(`MATCH (n:${label} {id: $id}) RETURN n`, { id });
        const props = result.records[0]?.get("n").properties;
        return props ? deserialize(props, jsonFields) : null;
      } finally {
        await session.close();
      }
    },

    async findByName(name: string): Promise<NodeProps | null> {
      const session = getSession();
      try {
        const result = await session.run(`MATCH (n:${label} {name: $name}) RETURN n LIMIT 1`, {
          name
        });
        const props = result.records[0]?.get("n").properties;
        return props ? deserialize(props, jsonFields) : null;
      } finally {
        await session.close();
      }
    },

    async create(data: NodeProps): Promise<NodeProps> {
      const session = getSession();
      const now = new Date().toISOString();
      const props = {
        id: randomUUID(),
        version: "0.1.0",
        ...data,
        createdAt: now,
        updatedAt: now
      };
      try {
        const result = await session.run(`CREATE (n:${label}) SET n = $props RETURN n`, {
          props: serialize(props, jsonFields)
        });
        return deserialize(result.records[0]!.get("n").properties, jsonFields);
      } finally {
        await session.close();
      }
    },

    async update(id: string, data: NodeProps): Promise<NodeProps | null> {
      const session = getSession();
      try {
        const result = await session.run(
          `MATCH (n:${label} {id: $id}) SET n += $props, n.updatedAt = $now RETURN n`,
          { id, props: serialize(data, jsonFields), now: new Date().toISOString() }
        );
        const props = result.records[0]?.get("n").properties;
        return props ? deserialize(props, jsonFields) : null;
      } finally {
        await session.close();
      }
    },

    async hardDelete(id: string): Promise<void> {
      const session = getSession();
      try {
        await session.run(`MATCH (n:${label} {id: $id}) DETACH DELETE n`, { id });
      } finally {
        await session.close();
      }
    },

    async relationshipCount(id: string): Promise<number> {
      const session = getSession();
      try {
        const result = await session.run(
          `MATCH (n:${label} {id: $id})-[r]-() RETURN count(r) AS c`,
          { id }
        );
        return Number(result.records[0]?.get("c") ?? 0);
      } finally {
        await session.close();
      }
    }
  };
}

export type NodeRepository = ReturnType<typeof createNodeRepository>;

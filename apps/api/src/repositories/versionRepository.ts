import { randomUUID } from "node:crypto";
import type { OntologyLabel, VersionCreateInput } from "@ontology-builder/shared";
import { getSession } from "../neo4j/driver.js";
import type { NodeProps } from "./nodeRepository.js";

export const versionRepository = {
  async list(): Promise<NodeProps[]> {
    const session = getSession();
    try {
      const result = await session.run(
        `MATCH (v:OntologyVersion) RETURN v ORDER BY v.createdAt DESC`
      );
      return result.records.map((r) => r.get("v").properties);
    } finally {
      await session.close();
    }
  },

  async findById(id: string): Promise<NodeProps | null> {
    const session = getSession();
    try {
      const result = await session.run(`MATCH (v:OntologyVersion {id: $id}) RETURN v`, { id });
      return result.records[0]?.get("v").properties ?? null;
    } finally {
      await session.close();
    }
  },

  async create(data: VersionCreateInput): Promise<NodeProps> {
    const session = getSession();
    try {
      const result = await session.run(
        `CREATE (v:OntologyVersion {
          id: $id, version: $version, description: $description,
          createdBy: $createdBy, status: 'DRAFT', createdAt: $now
        }) RETURN v`,
        {
          id: randomUUID(),
          version: data.version,
          description: data.description ?? null,
          createdBy: data.createdBy,
          now: new Date().toISOString()
        }
      );
      return result.records[0]!.get("v").properties;
    } finally {
      await session.close();
    }
  },

  async setStatus(id: string, status: "PUBLISHED" | "ARCHIVED"): Promise<NodeProps | null> {
    const session = getSession();
    try {
      const result = await session.run(
        `MATCH (v:OntologyVersion {id: $id}) SET v.status = $status RETURN v`,
        { id, status }
      );
      return result.records[0]?.get("v").properties ?? null;
    } finally {
      await session.close();
    }
  },

  async deleteDraft(id: string): Promise<boolean> {
    const session = getSession();
    try {
      const result = await session.run(
        `MATCH (v:OntologyVersion {id: $id, status: 'DRAFT'})
         WITH v, v.id AS deletedId DETACH DELETE v RETURN deletedId`,
        { id }
      );
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  },

  async attach(versionId: string, label: OntologyLabel, elementId: string): Promise<void> {
    const session = getSession();
    try {
      await session.run(
        `MATCH (v:OntologyVersion {id: $versionId}), (el:${label} {id: $elementId})
         MERGE (v)-[:CONTAINS]->(el)`,
        { versionId, elementId }
      );
    } finally {
      await session.close();
    }
  },

  async contents(versionId: string): Promise<Array<{ label: string; id: string; name: string }>> {
    const session = getSession();
    try {
      const result = await session.run(
        `MATCH (v:OntologyVersion {id: $versionId})-[:CONTAINS]->(el)
         RETURN labels(el) AS labels, el.id AS id, el.name AS name`,
        { versionId }
      );
      return result.records.map((r) => ({
        label: (r.get("labels") as string[])[0] ?? "Unknown",
        id: r.get("id"),
        name: r.get("name")
      }));
    } finally {
      await session.close();
    }
  }
};

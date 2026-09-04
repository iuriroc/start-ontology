import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { getSession } from "../neo4j/driver.js";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "IMPORT"
  | "EXPORT"
  | "BACKUP"
  | "RESTORE"
  | "PUBLISH_VERSION"
  | "ARCHIVE_VERSION";

export interface AuditEntry {
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  result: "SUCCESS" | "FAILURE";
}

/** Persists an audit trail entry as a Neo4j node, isolated from ontology
 * labels (never returned by ontology/graph queries). Never throws — an
 * audit failure must not fail the underlying business operation. */
export async function recordAudit(entry: AuditEntry, logger?: FastifyBaseLogger): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `CREATE (a:AuditLog {
        id: $id, action: $action, resourceType: $resourceType,
        resourceId: $resourceId, result: $result, timestamp: datetime()
      })`,
      { id: randomUUID(), ...entry }
    );
  } catch (err) {
    logger?.error({ err, entry }, "failed to persist audit log entry");
  } finally {
    await session.close();
  }
}

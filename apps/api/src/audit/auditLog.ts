import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { runQuery } from "../postgres/transaction.js";

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

/** Persists an audit trail entry in its own table, isolated from ontology
 * nodes (never returned by ontology/graph queries). Never throws — an
 * audit failure must not fail the underlying business operation. */
export async function recordAudit(entry: AuditEntry, logger?: FastifyBaseLogger): Promise<void> {
  try {
    await runQuery(
      undefined,
      `INSERT INTO audit_log (id, action, resource_type, resource_id, result, timestamp)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [randomUUID(), entry.action, entry.resourceType, entry.resourceId, entry.result]
    );
  } catch (err) {
    logger?.error({ err, entry }, "failed to persist audit log entry");
  }
}

import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getPool } from "./pool.js";
import { currentBusinessId } from "./tenantContext.js";

/** Anything a repository can run a query against: the shared pool, or a
 * client already inside a transaction (passed through by withTransaction). */
export type Queryable = Pool | PoolClient;

export const APP_ROLE = "ontology_app";

/**
 * Every API statement runs as the unprivileged ontology_app role with
 * app.business_id set for the transaction, so PostgreSQL Row-Level Security —
 * not application code — decides which rows exist. With no business in
 * context the setting is empty and every tenant table reads as empty / rejects
 * inserts (fail closed). Both settings are transaction-local (SET LOCAL /
 * set_config(..., true)) so a pooled connection never leaks them.
 */
async function begin(client: PoolClient, asOwner: boolean): Promise<void> {
  if (asOwner) {
    await client.query("BEGIN");
    return;
  }
  await client.query(`BEGIN; SET LOCAL ROLE ${APP_ROLE}`);
  await client.query(`SELECT set_config('app.business_id', $1, true)`, [currentBusinessId() ?? ""]);
}

async function runInTransaction<T>(asOwner: boolean, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await begin(client, asOwner);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Transaction scoped to the current business (RLS enforced). */
export function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return runInTransaction(false, fn);
}

/** Transaction as the connection owner, RLS bypassed for superusers. Only for
 * migrations — never reachable from a request handler. */
export function withOwnerTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return runInTransaction(true, fn);
}

export async function runQuery<T extends QueryResultRow = QueryResultRow>(
  queryable: Queryable | undefined,
  text: string,
  params?: unknown[]
) {
  if (queryable) return queryable.query<T>(text, params);
  return runInTransaction(false, (client) => client.query<T>(text, params));
}

import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getPool } from "./pool.js";

/** Anything a repository can run a query against: the shared pool, or a
 * client already inside a transaction (passed through by withTransaction). */
export type Queryable = Pool | PoolClient;

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
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

export async function runQuery<T extends QueryResultRow = QueryResultRow>(
  queryable: Queryable | undefined,
  text: string,
  params?: unknown[]
) {
  return (queryable ?? getPool()).query<T>(text, params);
}

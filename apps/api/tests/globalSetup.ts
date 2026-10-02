import { runMigrations } from "../src/postgres/migrations.js";
import { closePool, verifyConnectivity } from "../src/postgres/pool.js";

/** Applies postgres/migrations before the suite so integration tests work on
 * a fresh database (the API only migrates when server.ts boots). A no-op when
 * Postgres is unreachable — those tests skip themselves. */
export default async function setup() {
  if (!(await verifyConnectivity())) return;
  await runMigrations({ info() {}, warn() {} } as never);
  await closePool();
}

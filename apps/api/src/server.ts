import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { closePool, verifyConnectivity } from "./postgres/pool.js";
import { runMigrations } from "./postgres/migrations.js";

async function main() {
  const app = buildApp();

  const connected = await verifyConnectivity();
  if (connected) {
    await runMigrations(app.log);
  } else {
    app.log.warn("PostgreSQL is not reachable at boot — migrations were not applied. The API will still start; /api/health will report degraded until PostgreSQL is available.");
  }

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDriver, verifyConnectivity } from "./neo4j/driver.js";
import { runMigrations } from "./neo4j/migrations.js";

async function main() {
  const app = buildApp();

  const connected = await verifyConnectivity();
  if (connected) {
    await runMigrations(app.log);
  } else {
    app.log.warn("Neo4j is not reachable at boot — constraints/indexes were not applied. The API will still start; /api/health will report degraded until Neo4j is available.");
  }

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await closeDriver();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

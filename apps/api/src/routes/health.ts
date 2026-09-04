import type { FastifyInstance } from "fastify";
import { verifyConnectivity } from "../neo4j/driver.js";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async (_request, reply) => {
    const connected = await verifyConnectivity();
    if (!connected) reply.code(503);
    return {
      status: connected ? "ok" : "degraded",
      neo4j: connected ? "connected" : "disconnected"
    };
  });
}

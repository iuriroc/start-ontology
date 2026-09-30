import type { FastifyInstance } from "fastify";
import { verifyConnectivity } from "../postgres/pool.js";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async (_request, reply) => {
    const connected = await verifyConnectivity();
    if (!connected) reply.code(503);
    return {
      status: connected ? "ok" : "degraded",
      postgres: connected ? "connected" : "disconnected"
    };
  });
}

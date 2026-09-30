import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closePool } from "../src/postgres/pool.js";

describe("GET /api/health", () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it("reports PostgreSQL connectivity without throwing, connected or not", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    const body = JSON.parse(response.body);
    expect(["ok", "degraded"]).toContain(body.status);
    expect(["connected", "disconnected"]).toContain(body.postgres);
    expect([200, 503]).toContain(response.statusCode);
  });
});

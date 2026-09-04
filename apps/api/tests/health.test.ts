import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDriver } from "../src/neo4j/driver.js";

describe("GET /api/health", () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
    await closeDriver();
  });

  it("reports Neo4j connectivity without throwing, connected or not", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    const body = JSON.parse(response.body);
    expect(["ok", "degraded"]).toContain(body.status);
    expect(["connected", "disconnected"]).toContain(body.neo4j);
    expect([200, 503]).toContain(response.statusCode);
  });
});

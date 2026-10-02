import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { getPool, closePool, verifyConnectivity } from "../src/postgres/pool.js";
import { runQuery, withTransaction } from "../src/postgres/transaction.js";
import { runWithTenant } from "../src/postgres/tenantContext.js";
import { createBusiness, json, tenantClient } from "./helpers.js";

const dbAvailable = await verifyConnectivity();

describe.skipIf(!dbAvailable)("business isolation", () => {
  const app = buildApp();
  let A: { id: string; slug: string };
  let B: { id: string; slug: string };
  let inA: ReturnType<typeof tenantClient>;
  let inB: ReturnType<typeof tenantClient>;
  let secretId: string;

  beforeAll(async () => {
    A = await createBusiness(app, "Negocio A");
    B = await createBusiness(app, "Negocio B");
    inA = tenantClient(app, A.id);
    inB = tenantClient(app, B.id);
    const created = await inA({ method: "POST", url: "/api/entities", payload: { name: "Segredo-A", status: "ACTIVE" } });
    expect(created.statusCode).toBe(201);
    secretId = json(created.body).id;
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it("requires a valid, active business on every tenant route", async () => {
    const none = await app.inject({ method: "GET", url: "/api/entities" });
    expect(none.statusCode).toBe(400);
    expect(json(none.body).error.code).toBe("BUSINESS_REQUIRED");
    const unknown = await app.inject({ method: "GET", url: "/api/entities", headers: { "x-business-id": "nao-existe" } });
    expect(json(unknown.body).error.code).toBe("BUSINESS_NOT_FOUND");
    const bySlug = await app.inject({ method: "GET", url: "/api/entities", headers: { "x-business-id": A.slug } });
    expect(bySlug.statusCode).toBe(200);
    expect(json(bySlug.body).items.some((e: { id: string }) => e.id === secretId)).toBe(true);
  });

  it("never lists, reads, edits or deletes another business's rows", async () => {
    const list = json((await inB({ method: "GET", url: "/api/entities" })).body);
    expect(list.items.some((e: { id: string }) => e.id === secretId)).toBe(false);
    expect((await inB({ method: "GET", url: `/api/entities/${secretId}` })).statusCode).toBe(404);
    expect((await inB({ method: "PUT", url: `/api/entities/${secretId}`, payload: { name: "hack" } })).statusCode).toBe(404);
    expect((await inB({ method: "DELETE", url: `/api/entities/${secretId}?hard=true&force=true` })).statusCode).toBe(404);
    const still = json((await inA({ method: "GET", url: `/api/entities/${secretId}` })).body);
    expect(still.name).toBe("Segredo-A");
  });

  it("graph, stats and search only see the current business", async () => {
    const graph = json((await inB({ method: "GET", url: "/api/ontology/graph" })).body);
    expect(graph.nodes).toHaveLength(0);
    const stats = json((await inB({ method: "GET", url: "/api/ontology" })).body);
    expect(stats.counts.Entity).toBe(0);
  });

  it("cannot relate to a node of another business", async () => {
    const mine = json((await inB({ method: "POST", url: "/api/entities", payload: { name: "Meu-B", status: "ACTIVE" } })).body);
    const res = await inB({
      method: "POST",
      url: "/api/relationships",
      payload: { name: "x", type: "uses", sourceLabel: "Entity", sourceId: mine.id, targetLabel: "Entity", targetId: secretId, status: "ACTIVE" }
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("allows the same version number in different businesses", async () => {
    const a = await inA({ method: "POST", url: "/api/versions", payload: { version: "1.0.0", createdBy: "t" } });
    const b = await inB({ method: "POST", url: "/api/versions", payload: { version: "1.0.0", createdBy: "t" } });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
  });

  it("keeps one graph layout per business", async () => {
    await inA({ method: "PUT", url: "/api/ontology/graph/layout", payload: { [secretId]: { x: 1, y: 2 } } });
    expect(json((await inB({ method: "GET", url: "/api/ontology/graph/layout" })).body)).toEqual({});
    expect(json((await inA({ method: "GET", url: "/api/ontology/graph/layout" })).body)[secretId]).toEqual({ x: 1, y: 2 });
  });

  it("rejects restoring a backup whose ids belong to another business", async () => {
    const exported = await inA({ method: "GET", url: "/api/export" });
    expect(exported.statusCode).toBe(200);
    const boundary = "----b";
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="b.zip"\r\nContent-Type: application/zip\r\n\r\n`),
      exported.rawPayload,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const imported = await inB({ method: "POST", url: "/api/import", payload: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } });
    expect(imported.statusCode, imported.body).toBe(200);
    const importId = json(imported.body).importId;
    // A plan staged by B cannot be committed by A, and conflicts when B commits it.
    expect((await inA({ method: "POST", url: "/api/restore", payload: { importId, mode: "merge" } })).statusCode).toBe(400);
    const restored = await inB({ method: "POST", url: "/api/restore", payload: { importId, mode: "merge" } });
    expect(restored.statusCode).toBe(409);
    expect(json(restored.body).error.code).toBe("ID_BELONGS_TO_ANOTHER_BUSINESS");
  });

  describe("database level (RLS, not application code)", () => {
    it("fails closed with no business in context", async () => {
      const r = await runQuery<{ c: string }>(undefined, `SELECT count(*) AS c FROM ontology_nodes`);
      expect(Number(r.rows[0]!.c)).toBe(0);
      await expect(
        runQuery(undefined, `INSERT INTO ontology_nodes (id, label, name) VALUES (gen_random_uuid(), 'Entity', 'x')`)
      ).rejects.toThrow();
    });

    it("rejects writing a row stamped with another business", async () => {
      await expect(
        runWithTenant({ businessId: B.id }, () =>
          runQuery(undefined, `INSERT INTO ontology_nodes (id, label, name, business_id) VALUES (gen_random_uuid(), 'Entity', 'x', $1)`, [A.id])
        )
      ).rejects.toThrow(/row-level security/);
    });

    it("sees nothing of A even with a hand-written query", async () => {
      const r = await runWithTenant({ businessId: B.id }, () =>
        runQuery<{ c: string }>(undefined, `SELECT count(*) AS c FROM ontology_nodes WHERE business_id = $1`, [A.id])
      );
      expect(Number(r.rows[0]!.c)).toBe(0);
    });

    it("composite foreign keys block cross-business edges even for the table owner", async () => {
      const pool = getPool();
      const mine = await pool.query(`SELECT id FROM ontology_nodes WHERE business_id = $1 LIMIT 1`, [B.id]);
      await expect(
        pool.query(
          `INSERT INTO ontology_edges (id, source_id, target_id, type, business_id) VALUES (gen_random_uuid(), $1, $2, 'X', $3)`,
          [mine.rows[0].id, secretId, B.id]
        )
      ).rejects.toThrow(/foreign key/);
    });

    it("the app role cannot rewrite or delete the call audit", async () => {
      await expect(
        runWithTenant({ businessId: A.id }, () => withTransaction((c) => c.query(`UPDATE harness_calls SET decision = 'ALLOW'`)))
      ).rejects.toThrow(/permission denied/);
      await expect(
        runWithTenant({ businessId: A.id }, () => withTransaction((c) => c.query(`DELETE FROM harness_calls`)))
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("archived businesses are blocked; hard delete needs the slug and cascades", async () => {
    const C = await createBusiness(app, "Negocio C");
    const inC = tenantClient(app, C.id);
    await inC({ method: "POST", url: "/api/entities", payload: { name: "x", status: "ACTIVE" } });
    expect((await app.inject({ method: "DELETE", url: `/api/businesses/${C.id}` })).statusCode).toBe(200);
    const blocked = await inC({ method: "GET", url: "/api/entities" });
    expect(blocked.statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/api/businesses/${C.id}?hard=true` })).statusCode).toBe(409);
    expect((await app.inject({ method: "DELETE", url: `/api/businesses/${C.id}?hard=true&confirmSlug=${C.slug}` })).statusCode).toBe(200);
    const left = await getPool().query(`SELECT count(*) AS c FROM ontology_nodes WHERE business_id = $1`, [C.id]);
    expect(Number(left.rows[0].c)).toBe(0);
  });
});

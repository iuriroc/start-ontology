import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closePool, verifyConnectivity } from "../src/postgres/pool.js";

/**
 * End-to-end walk of the spec section 56 scenario: create the Seller /
 * Customer / Transaction ontology, relate them, version it, back it up,
 * restore it, and validate. Requires a live PostgreSQL (docker compose up -d
 * postgres) — skipped automatically otherwise so `npm test` still passes in
 * an environment with no database.
 */
const dbAvailable = await verifyConnectivity();

describe.skipIf(!dbAvailable)("ontology end-to-end scenario", () => {
  const app = buildApp();
  let businessId = "";
  const inject = (opts: Parameters<typeof app.inject>[0]) => {
    const o = opts as { headers?: Record<string, string> };
    return app.inject({ ...(opts as object), headers: { "x-business-id": businessId, ...o.headers } } as never);
  };

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/businesses",
      payload: { name: `Cenário ${Date.now()}`, slug: `cenario-${Date.now()}` }
    });
    expect(res.statusCode).toBe(201);
    businessId = JSON.parse(res.body).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const json = (body: string) => JSON.parse(body);

  it(
    "builds, versions, backs up, restores and validates the ontology",
    async () => {
    const seller = await inject({
      method: "POST",
      url: "/api/entities",
      payload: { name: "Seller", domain: "commerce", status: "ACTIVE" }
    });
    expect(seller.statusCode).toBe(201);
    const sellerBody = json(seller.body);

    const customer = await inject({
      method: "POST",
      url: "/api/entities",
      payload: {
        name: "Customer",
        domain: "commerce",
        status: "ACTIVE",
        properties: [{ name: "email", type: "STRING", required: true }]
      }
    });
    expect(customer.statusCode).toBe(201);
    const customerBody = json(customer.body);

    const transaction = await inject({
      method: "POST",
      url: "/api/entities",
      payload: { name: "Transaction", domain: "commerce", status: "ACTIVE" }
    });
    expect(transaction.statusCode).toBe(201);
    const transactionBody = json(transaction.body);

    const ownsRel = await inject({
      method: "POST",
      url: "/api/relationships",
      payload: {
        name: "Seller owns Customer",
        type: "owns",
        sourceLabel: "Entity",
        sourceId: sellerBody.id,
        targetLabel: "Entity",
        targetId: customerBody.id,
        cardinality: "ONE_TO_MANY"
      }
    });
    expect(ownsRel.statusCode).toBe(201);

    const performedRel = await inject({
      method: "POST",
      url: "/api/relationships",
      payload: {
        name: "Customer performed Transaction",
        type: "performed",
        sourceLabel: "Entity",
        sourceId: customerBody.id,
        targetLabel: "Entity",
        targetId: transactionBody.id,
        cardinality: "ONE_TO_MANY"
      }
    });
    expect(performedRel.statusCode).toBe(201);

    const concept = await inject({
      method: "POST",
      url: "/api/concepts",
      payload: { name: "HighValueSeller", status: "ACTIVE" }
    });
    expect(concept.statusCode).toBe(201);

    const rule = await inject({
      method: "POST",
      url: "/api/rules",
      payload: {
        name: "HighValueSellerRule",
        condition: "TPV > 250000",
        action: "Seller has Concept HighValueSeller",
        status: "ACTIVE"
      }
    });
    expect(rule.statusCode).toBe(201);

    const state = await inject({
      method: "POST",
      url: "/api/states",
      payload: { name: "ACTIVE", initial: true, final: true, status: "ACTIVE" }
    });
    expect(state.statusCode).toBe(201);

    const capability = await inject({
      method: "POST",
      url: "/api/capabilities",
      payload: { name: "Read Transaction", code: "READ_TRANSACTION", status: "ACTIVE" }
    });
    expect(capability.statusCode).toBe(201);
    const capabilityBody = json(capability.body);

    const agent = await inject({
      method: "POST",
      url: "/api/agents",
      payload: { name: "SupportAgent", role: "support", status: "ACTIVE" }
    });
    expect(agent.statusCode).toBe(201);
    const agentBody = json(agent.body);

    const policy = await inject({
      method: "POST",
      url: "/api/policies",
      payload: { name: "ReadTransactionPolicy", effect: "ALLOW", status: "ACTIVE" }
    });
    expect(policy.statusCode).toBe(201);
    const policyBody = json(policy.body);

    const hasCapability = await inject({
      method: "POST",
      url: "/api/relationships",
      payload: {
        name: "SupportAgent has READ_TRANSACTION",
        type: "has_capability",
        sourceLabel: "Agent",
        sourceId: agentBody.id,
        targetLabel: "Capability",
        targetId: capabilityBody.id,
        cardinality: "MANY_TO_MANY"
      }
    });
    expect(hasCapability.statusCode).toBe(201);

    const governedBy = await inject({
      method: "POST",
      url: "/api/relationships",
      payload: {
        name: "SupportAgent governed by ReadTransactionPolicy",
        type: "governed_by",
        sourceLabel: "Agent",
        sourceId: agentBody.id,
        targetLabel: "Policy",
        targetId: policyBody.id,
        cardinality: "MANY_TO_MANY"
      }
    });
    expect(governedBy.statusCode).toBe(201);

    // --- graph view ---
    const graph = await inject({ method: "GET", url: "/api/ontology/graph" });
    expect(graph.statusCode).toBe(200);
    const graphBody = json(graph.body);
    expect(graphBody.nodes.length).toBeGreaterThanOrEqual(9);
    expect(graphBody.edges.some((e: { label: string }) => e.label === "OWNS")).toBe(true);

    // --- version ---
    const version = await inject({
      method: "POST",
      url: "/api/versions",
      payload: { version: "1.0.0", description: "Initial ontology", createdBy: "test-suite" }
    });
    expect(version.statusCode).toBe(201);
    const versionBody = json(version.body);

    const attach = await inject({
      method: "POST",
      url: `/api/versions/${versionBody.id}/contents`,
      payload: { label: "Entity", elementId: sellerBody.id }
    });
    expect(attach.statusCode).toBe(200);

    const publish = await inject({ method: "POST", url: `/api/versions/${versionBody.id}/publish` });
    expect(publish.statusCode).toBe(200);
    expect(json(publish.body).status).toBe("PUBLISHED");

    // --- edit an entity via the API ---
    const editEntity = await inject({
      method: "PUT",
      url: `/api/entities/${sellerBody.id}`,
      payload: { description: "Marketplace seller" }
    });
    expect(editEntity.statusCode).toBe(200);
    expect(json(editEntity.body).description).toBe("Marketplace seller");

    // --- backup (export) ---
    const exported = await inject({ method: "GET", url: "/api/export" });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toBe("application/zip");
    const zipBuffer = exported.rawPayload;

    // --- restore via the real multipart /api/import + /api/restore flow ---
    const boundary = "----vitest-boundary";
    const multipartBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.zip"\r\nContent-Type: application/zip\r\n\r\n`
      ),
      zipBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const imported = await inject({
      method: "POST",
      url: "/api/import",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody
    });
    expect(imported.statusCode).toBe(200);
    const importedBody = json(imported.body);
    expect(importedBody.valid).toBe(true);
    expect(importedBody.counts.entities).toBeGreaterThanOrEqual(3);

    const restored = await inject({
      method: "POST",
      url: "/api/restore",
      payload: { importId: importedBody.importId, mode: "merge" }
    });
    expect(restored.statusCode).toBe(200);
    expect(json(restored.body).restored).toBe(true);

    // --- validate ---
    const validation = await inject({ method: "GET", url: "/api/ontology/validate" });
    expect(validation.statusCode).toBe(200);
    expect(json(validation.body).status).not.toBe("ERROR");

    // --- deleting an element with relationships requires force ---
    const blockedDelete = await inject({ method: "DELETE", url: `/api/entities/${sellerBody.id}` });
    expect(blockedDelete.statusCode).toBe(409);
  }, 60000);
});

afterAll(async () => {
  if (dbAvailable) await closePool();
});

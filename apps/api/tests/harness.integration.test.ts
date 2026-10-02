import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closePool, verifyConnectivity } from "../src/postgres/pool.js";
import { createBusiness, json, tenantClient } from "./helpers.js";

const dbAvailable = await verifyConnectivity();

/** NimbusPay-style support scenario: first-line agent may read purchases and
 * REQUEST (never execute) refunds, only after a 3-factor verification. */
describe.skipIf(!dbAvailable)("harness: gateway, guardrails, audit, evaluation", () => {
  const app = buildApp();
  let biz: { id: string; slug: string };
  let other: { id: string; slug: string };
  let admin: ReturnType<typeof tenantClient>;
  let apiKey = "";
  let humanId = "";

  const gw = (path: string, payload: unknown, key = apiKey) =>
    app.inject({ method: "POST", url: `/api/gateway/${path}`, payload: payload as never, headers: { authorization: `Bearer ${key}` } });

  const mk = async (url: string, payload: object) => {
    const r = await admin({ method: "POST", url, payload: { status: "ACTIVE", ...payload } });
    expect(r.statusCode, r.body).toBe(201);
    return json(r.body);
  };

  beforeAll(async () => {
    biz = await createBusiness(app, "NimbusPay");
    other = await createBusiness(app, "Outra Empresa");
    admin = tenantClient(app, biz.id);

    const n1 = await mk("/api/agents", { name: "Chat N1", role: "Atendimento N1" });
    const human = await mk("/api/agents", { name: "Humano", role: "Escalonamento" });
    humanId = human.id;
    const read = await mk("/api/capabilities", { name: "purchase.read", code: "PURCHASE_READ" });
    const req = await mk("/api/capabilities", { name: "refund.request", code: "REFUND_REQUEST" });
    const exec = await mk("/api/capabilities", { name: "refund.execute", code: "REFUND_EXECUTE" });
    for (const cap of [read, req]) {
      await mk("/api/relationships", {
        name: `N1 -> ${cap.name}`, type: "has capability",
        sourceLabel: "Agent", sourceId: n1.id, targetLabel: "Capability", targetId: cap.id
      });
    }

    const amountSchema = { type: "object", properties: { amount: { type: "number" }, orderId: { type: "string" } }, required: ["orderId"] };
    const tool = (capabilityId: string, name: string, riskTier: string, executor: object, inputSchema: object = amountSchema) =>
      admin({ method: "POST", url: "/api/harness/tools", payload: { capabilityId, name, riskTier, executor, inputSchema } });
    expect((await tool(read.id, "purchase.read", "LOW", { type: "mock", response: { status: "APPROVED" } })).statusCode).toBe(201);
    expect((await tool(req.id, "refund.request", "MEDIUM", { type: "mock", response: { ticket: "R-1" } })).statusCode).toBe(201);
    expect((await tool(exec.id, "refund.execute", "HIGH", { type: "mock" })).statusCode).toBe(201);

    const g = (payload: object) => admin({ method: "POST", url: "/api/harness/guardrails", payload });
    expect((await g({ name: "Pré-verificação LGPD", kind: "REQUIRE_VERIFICATION", config: { factors: ["cpf", "name", "card_last4"] } })).statusCode).toBe(201);
    expect((await g({ name: "Limite de reembolso", kind: "LIMIT", appliesTo: { tools: ["refund.request"] }, config: { param: "amount", max: 500, onExceed: "ESCALATE", escalateToAgentId: human.id } })).statusCode).toBe(201);
    expect((await g({ name: "Sem execução de reembolso", kind: "DENY", appliesTo: { tools: ["refund.execute"] }, config: { reason: "Reembolso só por humano" } })).statusCode).toBe(201);

    const key = await admin({ method: "POST", url: "/api/harness/api-keys", payload: { name: "paperclip" } });
    expect(key.statusCode).toBe(201);
    apiKey = json(key.body).key;
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  const verified = { sessionId: "s1", verifiedFactors: ["cpf", "name", "card_last4"] };

  it("denies until the trusted runtime reports all 3 verification factors", async () => {
    const r = json((await gw("authorize", { agent: "Chat N1", tool: "purchase.read", args: { orderId: "o1" }, context: { sessionId: "s1", verifiedFactors: ["cpf", "name"] } })).body);
    expect(r.decision).toBe("DENY");
    expect(r.reasons[0].code).toBe("VERIFICATION_REQUIRED");
  });

  it("allows and executes a granted tool after verification", async () => {
    const r = json((await gw("execute", { agent: "Chat N1", tool: "purchase.read", args: { orderId: "o1", cpf: "12345678900" }, context: verified })).body);
    expect(r).toMatchObject({ decision: "ALLOW", executed: true, result: { status: "APPROVED" } });
  });

  it("requests a refund within the limit, escalates above it with a Handoff", async () => {
    const small = json((await gw("execute", { agent: "Chat N1", tool: "refund.request", args: { orderId: "o1", amount: 100 }, context: verified })).body);
    expect(small).toMatchObject({ decision: "ALLOW", executed: true });
    const big = json((await gw("execute", { agent: "Chat N1", tool: "refund.request", args: { orderId: "o1", amount: 900 }, context: verified })).body);
    expect(big.decision).toBe("ESCALATE");
    expect(big.executed).toBe(false);
    expect(big.handoffId).toBeTruthy();
    const handoffs = json((await admin({ method: "GET", url: "/api/handoffs" })).body);
    expect(handoffs.items.some((h: { id: string; toAgentId: string }) => h.id === big.handoffId && h.toAgentId === humanId)).toBe(true);
  });

  it("never lets the agent execute a refund", async () => {
    const r = json((await gw("execute", { agent: "Chat N1", tool: "refund.execute", args: { orderId: "o1" }, context: verified })).body);
    expect(r.decision).toBe("DENY");
    const codes = r.reasons.map((x: { code: string }) => x.code);
    expect(codes).toContain("NO_CAPABILITY_GRANT");
    expect(codes).toContain("GUARDRAIL_DENY");
    expect(r.executed).toBe(false);
  });

  it("denies invalid arguments and unknown agents/tools instead of erroring", async () => {
    expect(json((await gw("authorize", { agent: "Chat N1", tool: "purchase.read", args: {}, context: verified })).body).reasons[0].code).toBe("INVALID_ARGUMENTS");
    expect(json((await gw("authorize", { agent: "Fantasma", tool: "purchase.read", args: { orderId: "o" }, context: verified })).body).reasons[0].code).toBe("AGENT_NOT_FOUND");
    expect(json((await gw("authorize", { agent: "Chat N1", tool: "nope.tool", args: {}, context: verified })).body).reasons[0].code).toBe("TOOL_NOT_FOUND");
  });

  it("dryRun evaluates and logs but never executes or opens a handoff", async () => {
    const r = json((await gw("execute", { agent: "Chat N1", tool: "refund.request", args: { orderId: "o1", amount: 900 }, context: verified, dryRun: true })).body);
    expect(r).toMatchObject({ decision: "ESCALATE", mode: "DRY_RUN", executed: false });
    expect(r.handoffId).toBeUndefined();
  });

  it("audits every decision with sensitive data redacted", async () => {
    const calls = json((await admin({ method: "GET", url: "/api/harness/calls" })).body);
    expect(calls.items.length).toBeGreaterThanOrEqual(8);
    expect(calls.summary.DENY).toBeGreaterThan(0);
    const withCpf = calls.items.find((c: { args: { cpf?: string } }) => c.args.cpf !== undefined);
    expect(withCpf.args.cpf).toBe("[REDACTED]");
    expect(JSON.stringify(calls.items)).not.toContain("12345678900");
  });

  it("rejects missing, wrong and revoked API keys", async () => {
    const body = { agent: "Chat N1", tool: "purchase.read", args: { orderId: "o" } };
    expect((await app.inject({ method: "POST", url: "/api/gateway/authorize", payload: body })).statusCode).toBe(401);
    expect((await gw("authorize", body, "hk_invalida")).statusCode).toBe(401);
    const k = json((await admin({ method: "POST", url: "/api/harness/api-keys", payload: { name: "tmp" } })).body);
    expect((await gw("authorize", body, k.key)).statusCode).toBe(200);
    expect((await admin({ method: "DELETE", url: `/api/harness/api-keys/${k.id}` })).statusCode).toBe(200);
    expect((await gw("authorize", body, k.key)).statusCode).toBe(401);
    const list = json((await admin({ method: "GET", url: "/api/harness/api-keys" })).body);
    expect(JSON.stringify(list)).not.toContain(apiKey);
  });

  it("a key only ever acts inside its own business", async () => {
    const otherAdmin = tenantClient(app, other.id);
    const k = json((await otherAdmin({ method: "POST", url: "/api/harness/api-keys", payload: { name: "other" } })).body);
    const r = json((await gw("authorize", { agent: "Chat N1", tool: "purchase.read", args: { orderId: "o" }, context: verified }, k.key)).body);
    expect(r.decision).toBe("DENY");
    expect(r.reasons[0].code).toBe("AGENT_NOT_FOUND");
    expect(json((await otherAdmin({ method: "GET", url: "/api/harness/calls" })).body).items.every((c: { agentName: string }) => c.agentName === "Chat N1")).toBe(true);
    expect(json((await otherAdmin({ method: "GET", url: "/api/harness/tools" })).body).items).toHaveLength(0);
  });

  it("compiles a deterministic per-business bundle and agent context", async () => {
    const a = json((await admin({ method: "GET", url: "/api/harness/compile" })).body);
    const b = json((await admin({ method: "GET", url: "/api/harness/compile" })).body);
    expect(a.checksum).toBe(b.checksum);
    const n1 = a.bundle.agents.find((x: { name: string }) => x.name === "Chat N1");
    expect(n1.tools).toEqual(["purchase.read", "refund.request"]);
    expect(JSON.stringify(a)).not.toContain("R-1"); // executor details never reach the model
    expect(a.bundle.handoffs).toHaveLength(0); // runtime escalations are not ontology
    const ctx = json((await admin({ method: "GET", url: "/api/harness/compile/agent/Chat%20N1" })).body);
    expect(ctx.context).toContain("purchase.read");
    expect(ctx.context).not.toContain("refund.execute`");
    const stored = await admin({ method: "POST", url: "/api/harness/bundles", payload: {} });
    expect(stored.statusCode).toBe(201);
    const viaKey = json((await app.inject({ method: "GET", url: "/api/gateway/bundle", headers: { authorization: `Bearer ${apiKey}` } })).body);
    expect(viaKey.checksum).toBe(a.checksum);
    const ctxKey = await app.inject({ method: "GET", url: "/api/gateway/agents/Chat%20N1/context", headers: { authorization: `Bearer ${apiKey}` } });
    expect(ctxKey.statusCode).toBe(200);
  });

  it("evaluation cases pass against the live gateway and catch regressions", async () => {
    const n1 = json((await admin({ method: "GET", url: "/api/harness/agents" })).body).items.find((a: { name: string }) => a.name === "Chat N1");
    const mkCase = (payload: object) => admin({ method: "POST", url: "/api/harness/eval-cases", payload: { agentId: n1.id, ...payload } });
    expect((await mkCase({ name: "N1 não executa reembolso", toolName: "refund.execute", args: { orderId: "o" }, context: verified, expectedDecision: "DENY", expectedReason: "GUARDRAIL_DENY" })).statusCode).toBe(201);
    expect((await mkCase({ name: "Sem 3 fatores é negado", toolName: "purchase.read", args: { orderId: "o" }, context: { verifiedFactors: ["cpf"] }, expectedDecision: "DENY", expectedReason: "VERIFICATION_REQUIRED" })).statusCode).toBe(201);
    expect((await mkCase({ name: "Reembolso grande escala", toolName: "refund.request", args: { orderId: "o", amount: 5000 }, context: verified, expectedDecision: "ESCALATE" })).statusCode).toBe(201);
    expect((await mkCase({ name: "Leitura verificada passa", toolName: "purchase.read", args: { orderId: "o" }, context: verified, expectedDecision: "ALLOW" })).statusCode).toBe(201);
    const run = json((await admin({ method: "POST", url: "/api/harness/eval-runs" })).body);
    expect(run).toMatchObject({ total: 4, passed: 4, failed: 0 });

    // Regression: someone disables the verification guardrail -> the eval run must fail.
    const gs = json((await admin({ method: "GET", url: "/api/harness/guardrails" })).body).items;
    const lgpd = gs.find((x: { name: string }) => x.name === "Pré-verificação LGPD");
    await admin({ method: "PUT", url: `/api/harness/guardrails/${lgpd.id}`, payload: { status: "DISABLED" } });
    const broken = json((await admin({ method: "POST", url: "/api/harness/eval-runs" })).body);
    expect(broken.failed).toBeGreaterThan(0);
    expect(broken.results.find((r: { passed: boolean }) => !r.passed).name).toBe("Sem 3 fatores é negado");
    await admin({ method: "PUT", url: `/api/harness/guardrails/${lgpd.id}`, payload: { status: "ACTIVE" } });
  });

  it("clones ontology + harness config into an empty business with fresh ids", async () => {
    const target = await createBusiness(app, "NimbusPay Filial");
    const res = await app.inject({ method: "POST", url: `/api/businesses/${target.id}/clone`, payload: { sourceBusinessId: biz.id } });
    expect(res.statusCode, res.body).toBe(200);
    expect(json(res.body).copied).toMatchObject({ tools: 3, guardrails: 3, evalCases: 4 });
    const t = tenantClient(app, target.id);
    const agents = json((await t({ method: "GET", url: "/api/harness/agents" })).body).items;
    const original = json((await admin({ method: "GET", url: "/api/harness/agents" })).body).items;
    expect(agents).toHaveLength(2);
    expect(agents.map((a: { id: string }) => a.id).some((id: string) => original.some((o: { id: string }) => o.id === id))).toBe(false);
    const run = json((await t({ method: "POST", url: "/api/harness/eval-runs" })).body);
    expect(run).toMatchObject({ total: 4, passed: 4, failed: 0 });
    const again = await app.inject({ method: "POST", url: `/api/businesses/${target.id}/clone`, payload: { sourceBusinessId: biz.id } });
    expect(again.statusCode).toBe(409);
  });

  it("blocks http executors to hosts outside the business allowlist", async () => {
    const caps = json((await admin({ method: "GET", url: "/api/capabilities" })).body).items;
    const cap = caps.find((c: { name: string }) => c.name === "purchase.read");
    const t = await admin({
      method: "POST", url: "/api/harness/tools",
      payload: { capabilityId: cap.id, name: "purchase.fetch", executor: { type: "http", method: "GET", url: "http://169.254.169.254/latest/meta-data" }, inputSchema: { type: "object", properties: {} } }
    });
    expect(t.statusCode).toBe(201);
    const n1 = json((await admin({ method: "GET", url: "/api/harness/agents" })).body).items.find((a: { name: string }) => a.name === "Chat N1");
    void n1;
    const r = json((await gw("execute", { agent: "Chat N1", tool: "purchase.fetch", args: {}, context: verified })).body);
    expect(r.decision).toBe("ALLOW");
    expect(r.executed).toBe(false);
    expect(r.error).toContain("HOST_NOT_ALLOWED");
  });
});

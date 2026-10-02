import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  apiKeyCreateSchema, evalCaseCreateSchema, evalCaseUpdateSchema, gatewayCallSchema,
  guardrailCreateSchema, guardrailUpdateSchema, toolCreateSchema, toolUpdateSchema
} from "@ontology-builder/shared";
import { recordAudit } from "../audit/auditLog.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { compileBundle, renderAgentContext } from "../harness/compiler.js";
import { runEvaluation } from "../harness/evalRunner.js";
import { processGatewayCall } from "../harness/gateway.js";
import { hashApiKey } from "../plugins/tenant.js";
import { requireBusinessId } from "../postgres/tenantContext.js";
import {
  apiKeyRepository, bundleRepository, callRepository, evalCaseRepository,
  evalRunRepository, guardrailRepository, toolRepository
} from "../repositories/harnessRepository.js";
import { createNodeRepository } from "../repositories/nodeRepository.js";
import { parseWith } from "../validators/parse.js";

const callsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  decision: z.enum(["ALLOW", "DENY", "ESCALATE"]).optional(),
  mode: z.enum(["LIVE", "DRY_RUN", "EVAL"]).optional()
});
const compileQuerySchema = z.object({ versionId: z.string().uuid().optional() });

/** Maps a foreign-key / unique violation to a friendly API error. */
function mapDbError(err: unknown): never {
  const code = (err as { code?: string }).code;
  if (code === "23505") throw conflict("ALREADY_EXISTS", "Já existe um registro com esse nome neste negócio");
  if (code === "23503") throw badRequest("INVALID_REFERENCE", "Referência inexistente neste negócio (habilidade, diretriz ou agente)");
  throw err;
}

/** Harness administration for the CURRENT business (X-Business-Id). */
export function registerHarnessRoutes(app: FastifyInstance): void {
  // ---- tools
  app.get("/harness/tools", async () => ({ items: await toolRepository.list() }));
  app.post("/harness/tools", async (request, reply) => {
    const body = parseWith(toolCreateSchema, request.body);
    try {
      const created = await toolRepository.create(body);
      await recordAudit({ action: "CREATE", resourceType: "HarnessTool", resourceId: created.id, result: "SUCCESS" }, app.log);
      reply.code(201);
      return created;
    } catch (err) { mapDbError(err); }
  });
  app.put("/harness/tools/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = parseWith(toolUpdateSchema, request.body);
    try {
      const updated = await toolRepository.update(id, body);
      if (!updated) throw notFound("HarnessTool", id);
      return updated;
    } catch (err) { mapDbError(err); }
  });
  app.delete("/harness/tools/:id", async (request) => {
    const { id } = request.params as { id: string };
    if (!(await toolRepository.remove(id))) throw notFound("HarnessTool", id);
    return { deleted: true };
  });

  // ---- guardrails
  app.get("/harness/guardrails", async () => ({ items: await guardrailRepository.list() }));
  app.post("/harness/guardrails", async (request, reply) => {
    const body = parseWith(guardrailCreateSchema, request.body);
    try {
      const created = await guardrailRepository.create(body);
      await recordAudit({ action: "CREATE", resourceType: "HarnessGuardrail", resourceId: created.id, result: "SUCCESS" }, app.log);
      reply.code(201);
      return created;
    } catch (err) { mapDbError(err); }
  });
  app.put("/harness/guardrails/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = parseWith(guardrailUpdateSchema, request.body);
    try {
      const updated = await guardrailRepository.update(id, body);
      if (!updated) throw notFound("HarnessGuardrail", id);
      return updated;
    } catch (err) { mapDbError(err); }
  });
  app.delete("/harness/guardrails/:id", async (request) => {
    const { id } = request.params as { id: string };
    if (!(await guardrailRepository.remove(id))) throw notFound("HarnessGuardrail", id);
    return { deleted: true };
  });

  // ---- compile / bundles
  app.get("/harness/compile", async (request) => {
    const q = parseWith(compileQuerySchema, request.query);
    return compileBundle(q.versionId);
  });
  app.get("/harness/compile/agent/:agent", async (request) => {
    const { agent } = request.params as { agent: string };
    const compiled = await compileBundle();
    const context = renderAgentContext(compiled.bundle, agent);
    if (context === null) throw notFound("Agent", agent);
    return { checksum: compiled.checksum, context };
  });
  app.post("/harness/bundles", async (request, reply) => {
    const q = parseWith(compileQuerySchema, request.body ?? {});
    const compiled = await compileBundle(q.versionId);
    const stored = await bundleRepository.insert(compiled.checksum, compiled.bundle);
    reply.code(201);
    return stored;
  });
  app.get("/harness/bundles", async () => ({ items: await bundleRepository.list() }));

  // ---- audit
  app.get("/harness/calls", async (request) => {
    const q = parseWith(callsQuerySchema, request.query);
    return { items: await callRepository.list(q), summary: await callRepository.summary() };
  });

  // ---- admin-side dry run ("try this call") — never executes, never hands off
  app.post("/harness/simulate", async (request) => {
    const body = parseWith(gatewayCallSchema, request.body);
    return processGatewayCall({ ...body, dryRun: true }, { execute: false });
  });

  // ---- evaluation
  app.get("/harness/eval-cases", async () => ({ items: await evalCaseRepository.list() }));
  app.post("/harness/eval-cases", async (request, reply) => {
    const body = parseWith(evalCaseCreateSchema, request.body);
    try {
      const created = await evalCaseRepository.create(body);
      reply.code(201);
      return created;
    } catch (err) { mapDbError(err); }
  });
  app.put("/harness/eval-cases/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = parseWith(evalCaseUpdateSchema, request.body);
    try {
      const updated = await evalCaseRepository.update(id, body);
      if (!updated) throw notFound("EvalCase", id);
      return updated;
    } catch (err) { mapDbError(err); }
  });
  app.delete("/harness/eval-cases/:id", async (request) => {
    const { id } = request.params as { id: string };
    if (!(await evalCaseRepository.remove(id))) throw notFound("EvalCase", id);
    return { deleted: true };
  });
  app.post("/harness/eval-runs", async (_request, reply) => {
    const run = await runEvaluation();
    reply.code(201);
    return run;
  });
  app.get("/harness/eval-runs", async () => ({ items: await evalRunRepository.list() }));

  // ---- runtime API keys (plaintext is returned exactly once)
  app.get("/harness/api-keys", async () => ({ items: await apiKeyRepository.list(requireBusinessId()) }));
  app.post("/harness/api-keys", async (request, reply) => {
    const body = parseWith(apiKeyCreateSchema, request.body);
    const key = `hk_${randomBytes(32).toString("base64url")}`;
    const id = await apiKeyRepository.create(requireBusinessId(), body.name, key.slice(0, 10), hashApiKey(key));
    reply.code(201);
    return { id, name: body.name, key, notice: "Guarde esta chave agora; ela não poderá ser exibida novamente." };
  });
  app.delete("/harness/api-keys/:id", async (request) => {
    const { id } = request.params as { id: string };
    if (!(await apiKeyRepository.revoke(requireBusinessId(), id))) throw notFound("ApiKey", id);
    return { revoked: true };
  });

  // keep the generic agent lookup handy for the UI picker
  app.get("/harness/agents", async () => ({
    items: (await createNodeRepository("Agent").list({ limit: 500, offset: 0 })).map((a) => ({ id: a.id, name: a.name, status: a.status }))
  }));
}

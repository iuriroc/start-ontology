import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { businessCloneSchema, businessCreateSchema, businessUpdateSchema } from "@ontology-builder/shared";
import { conflict, notFound } from "../errors.js";
import { runQuery } from "../postgres/transaction.js";
import { businessRepository } from "../repositories/businessRepository.js";
import { cloneBusiness } from "../services/cloneBusiness.js";
import { parseWith } from "../validators/parse.js";

const deleteQuerySchema = z.object({ hard: z.enum(["true", "false"]).optional(), confirmSlug: z.string().optional() });

/** Business registry (control plane — not scoped by X-Business-Id). */
export function registerBusinessRoutes(app: FastifyInstance): void {
  app.get("/businesses", async () => ({ items: await businessRepository.list() }));

  app.get("/businesses/:id", async (request) => {
    const { id } = request.params as { id: string };
    const business = await businessRepository.resolve(id);
    if (!business) throw notFound("Business", id);
    return business;
  });

  app.post("/businesses", async (request, reply) => {
    const body = parseWith(businessCreateSchema, request.body);
    try {
      const created = await businessRepository.create(body);
      reply.code(201);
      return created;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw conflict("BUSINESS_SLUG_TAKEN", "Já existe um negócio com esse slug");
      }
      throw err;
    }
  });

  app.put("/businesses/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = parseWith(businessUpdateSchema, request.body);
    const existing = await businessRepository.resolve(id);
    if (!existing) throw notFound("Business", id);
    return (await businessRepository.update(existing.id, body))!;
  });

  /** Archive by default (reversible via PUT status=ACTIVE). Hard delete wipes
   * every row of the business and requires confirmSlug to match. */
  app.delete("/businesses/:id", async (request) => {
    const { id } = request.params as { id: string };
    const q = parseWith(deleteQuerySchema, request.query);
    const existing = await businessRepository.resolve(id);
    if (!existing) throw notFound("Business", id);
    if (q.hard === "true") {
      if (q.confirmSlug !== existing.slug) {
        throw conflict("CONFIRM_SLUG_REQUIRED", `Para apagar definitivamente passe confirmSlug=${existing.slug}`);
      }
      await businessRepository.hardDelete(existing.id);
      return { deleted: true };
    }
    await businessRepository.update(existing.id, { status: "ARCHIVED" });
    return { archived: true };
  });

  /** Row counts per business, for the business picker/overview. */
  app.get("/businesses/:id/summary", async (request) => {
    const { id } = request.params as { id: string };
    const existing = await businessRepository.resolve(id);
    if (!existing) throw notFound("Business", id);
    // Counts must be taken inside that business's context to honour RLS.
    const { runWithTenant } = await import("../postgres/tenantContext.js");
    return runWithTenant({ businessId: existing.id }, async () => {
      const [nodes, tools, guardrails, calls] = await Promise.all([
        runQuery<{ c: string }>(undefined, `SELECT count(*) AS c FROM ontology_nodes`),
        runQuery<{ c: string }>(undefined, `SELECT count(*) AS c FROM harness_tools`),
        runQuery<{ c: string }>(undefined, `SELECT count(*) AS c FROM harness_guardrails`),
        runQuery<{ c: string }>(undefined, `SELECT count(*) AS c FROM harness_calls`)
      ]);
      return {
        nodes: Number(nodes.rows[0]!.c), tools: Number(tools.rows[0]!.c),
        guardrails: Number(guardrails.rows[0]!.c), calls: Number(calls.rows[0]!.c)
      };
    });
  });

  app.post("/businesses/:id/clone", async (request) => {
    const { id } = request.params as { id: string };
    const body = parseWith(businessCloneSchema, request.body);
    const target = await businessRepository.resolve(id);
    if (!target) throw notFound("Business", id);
    return cloneBusiness(target.id, body.sourceBusinessId);
  });
}

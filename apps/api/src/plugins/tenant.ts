import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { BUSINESS_HEADER } from "@ontology-builder/shared";
import { badRequest, forbidden, unauthorized } from "../errors.js";
import { runQuery } from "../postgres/transaction.js";
import { runWithTenant, type TenantStore } from "../postgres/tenantContext.js";
import { businessRepository } from "../repositories/businessRepository.js";

declare module "fastify" {
  interface FastifyRequest {
    tenant: TenantStore;
  }
}

/** Routes that run with no business: liveness and the business registry itself. */
function isPublic(path: string): boolean {
  return path === "/api/health" || path === "/api/businesses" || path.startsWith("/api/businesses/");
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function businessFromApiKey(header: string | undefined): Promise<string> {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!match) throw unauthorized("API_KEY_REQUIRED", "Envie 'Authorization: Bearer <chave>' (chave do harness do negócio)");
  const r = await runQuery<{ business_id: string }>(
    undefined,
    `SELECT k.business_id FROM harness_api_keys k
     JOIN businesses b ON b.id = k.business_id
     WHERE k.key_hash = $1 AND k.revoked_at IS NULL AND b.status = 'ACTIVE'`,
    [hashApiKey(match[1]!)]
  );
  if (!r.rows[0]) throw unauthorized("API_KEY_INVALID", "Chave inválida, revogada ou de negócio arquivado");
  return r.rows[0].business_id;
}

async function businessFromHeader(request: FastifyRequest): Promise<string> {
  const raw = request.headers[BUSINESS_HEADER];
  const ref = Array.isArray(raw) ? raw[0] : raw;
  if (!ref) {
    throw badRequest("BUSINESS_REQUIRED", `Informe o negócio no header ${BUSINESS_HEADER} (id ou slug)`);
  }
  const business = await businessRepository.resolve(ref.trim());
  if (!business) throw badRequest("BUSINESS_NOT_FOUND", `Negócio '${ref}' não existe`);
  if (business.status !== "ACTIVE") throw forbidden("BUSINESS_ARCHIVED", `Negócio '${business.slug}' está arquivado`);
  return business.id;
}

/**
 * Establishes the business for each request, fail-closed:
 *   - /api/gateway/*  -> business comes from the Bearer API key (agent runtimes)
 *   - /api/health, /api/businesses* -> no business
 *   - everything else -> business from the X-Business-Id header
 * The AsyncLocalStorage store is created synchronously in the first onRequest
 * hook (done() is invoked inside storage.run so later hooks and the handler
 * inherit it); the second hook fills in businessId after the async lookup.
 */
export default fp(async (app) => {
  app.decorateRequest("tenant", undefined as unknown as TenantStore);

  app.addHook("onRequest", (request, _reply, done) => {
    const store: TenantStore = {};
    request.tenant = store;
    runWithTenant(store, done);
  });

  app.addHook("onRequest", async (request) => {
    const route = request.routeOptions?.url;
    if (!route) return; // unmatched route -> 404 handler
    if (!route.startsWith("/api") || isPublic(route)) return;
    if (route.startsWith("/api/gateway")) {
      request.tenant.businessId = await businessFromApiKey(request.headers.authorization);
      return;
    }
    request.tenant.businessId = await businessFromHeader(request);
  });
});

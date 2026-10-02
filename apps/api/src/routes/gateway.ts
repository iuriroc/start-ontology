import type { FastifyInstance } from "fastify";
import { gatewayCallSchema } from "@ontology-builder/shared";
import { compileBundle, renderAgentContext } from "../harness/compiler.js";
import { processGatewayCall } from "../harness/gateway.js";
import { notFound } from "../errors.js";
import { bundleRepository } from "../repositories/harnessRepository.js";
import { parseWith } from "../validators/parse.js";

/**
 * Runtime-facing API for the agent platform (Paperclip, n8n, ...). The
 * business is taken from the Bearer API key, never from a client-supplied id,
 * so a runtime can only ever act inside the business its key belongs to.
 */
export function registerGatewayRoutes(app: FastifyInstance): void {
  /** Latest stored bundle, or a fresh compile when none was published yet. */
  app.get("/gateway/bundle", async () => {
    const stored = await bundleRepository.latest();
    if (stored) return { id: stored.id, checksum: stored.checksum, createdAt: stored.createdAt, bundle: stored.content };
    const compiled = await compileBundle();
    return { checksum: compiled.checksum, createdAt: compiled.compiledAt, bundle: compiled.bundle };
  });

  /** System-prompt context for one agent (id or name). */
  app.get("/gateway/agents/:agent/context", async (request) => {
    const { agent } = request.params as { agent: string };
    const compiled = await compileBundle();
    const context = renderAgentContext(compiled.bundle, agent);
    if (context === null) throw notFound("Agent", agent);
    return { checksum: compiled.checksum, context };
  });

  /** Ask permission only: the runtime performs the action itself when ALLOW. */
  app.post("/gateway/authorize", async (request) => {
    const body = parseWith(gatewayCallSchema, request.body);
    return processGatewayCall(body, { execute: false });
  });

  /** Ask permission and let the gateway perform the tool (http/mock executors). */
  app.post("/gateway/execute", async (request) => {
    const body = parseWith(gatewayCallSchema, request.body);
    return processGatewayCall(body, { execute: true });
  });
}

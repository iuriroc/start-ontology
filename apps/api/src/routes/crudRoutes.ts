import type { FastifyInstance } from "fastify";
import { paginationQuerySchema } from "@ontology-builder/shared";
import type { z } from "zod";
import type { OntologyService } from "../services/ontologyService.js";
import { parseWith } from "../validators/parse.js";

export interface CrudRouteConfig<TCreate extends z.ZodTypeAny, TUpdate extends z.ZodTypeAny> {
  path: string;
  service: OntologyService;
  createSchema: TCreate;
  updateSchema: TUpdate;
}

/** Registers the standard list/get/create/update/delete routes shared by
 * every ontology resource (spec section 24). Resource-specific behaviour
 * (e.g. relationships creating graph edges) lives in the service/repository
 * passed in, not here. */
export function registerCrudRoutes<TCreate extends z.ZodTypeAny, TUpdate extends z.ZodTypeAny>(
  app: FastifyInstance,
  { path, service, createSchema, updateSchema }: CrudRouteConfig<TCreate, TUpdate>
): void {
  app.get(`/${path}`, async (request) => {
    const query = parseWith(paginationQuerySchema, request.query);
    return service.list(query);
  });

  app.get(`/${path}/:id`, async (request) => {
    const { id } = request.params as { id: string };
    return service.get(id);
  });

  app.post(`/${path}`, async (request, reply) => {
    const body = parseWith(createSchema, request.body);
    const created = await service.create(body as Record<string, unknown>);
    reply.code(201);
    return created;
  });

  app.put(`/${path}/:id`, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseWith(updateSchema, request.body);
    return service.update(id, body as Record<string, unknown>);
  });

  app.delete(`/${path}/:id`, async (request) => {
    const { id } = request.params as { id: string };
    const { hard, force } = request.query as { hard?: string; force?: string };
    return service.remove(id, { hard: hard === "true", force: force === "true" });
  });
}

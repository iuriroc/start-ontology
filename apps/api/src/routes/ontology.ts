import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ONTOLOGY_LABELS } from "@ontology-builder/shared";
import { graphRepository } from "../repositories/graphRepository.js";
import { validateOntology } from "../services/ontologyValidator.js";
import { parseWith } from "../validators/parse.js";

const graphQuerySchema = z.object({
  labels: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((l) => (ONTOLOGY_LABELS as readonly string[]).includes(l)) : undefined)),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  domain: z.string().optional()
});

const layoutSchema = z.record(
  z.string().uuid(),
  z.object({ x: z.number(), y: z.number() })
);

export function registerOntologyRoutes(app: FastifyInstance): void {
  app.get("/ontology/graph", async (request) => {
    const query = parseWith(graphQuerySchema, request.query);
    return graphRepository.getGraph(query);
  });

  app.get("/ontology/graph/layout", async () => graphRepository.getLayout());

  app.put("/ontology/graph/layout", async (request) => {
    const body = parseWith(layoutSchema, request.body);
    await graphRepository.saveLayout(body);
    return { saved: true };
  });

  // Internal inspection view (spec section 42/44) — dashboard stats, not a
  // Markdown/JSON "report" feature.
  app.get("/ontology", async () => graphRepository.getStats());

  app.get("/ontology/validate", async () => validateOntology());
}

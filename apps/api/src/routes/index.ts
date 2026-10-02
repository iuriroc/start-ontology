import type { FastifyInstance } from "fastify";
import { relationshipCreateSchema, relationshipUpdateSchema, handoffCreateSchema, handoffUpdateSchema } from "@ontology-builder/shared";
import { createNodeRepository } from "../repositories/nodeRepository.js";
import { relationshipRepository } from "../repositories/relationshipRepository.js";
import { handoffRepository } from "../repositories/handoffRepository.js";
import { createOntologyService, type CrudRepository } from "../services/ontologyService.js";
import { registerCrudRoutes } from "./crudRoutes.js";
import { SIMPLE_RESOURCES } from "./registry.js";
import { registerHealthRoutes } from "./health.js";
import { registerOntologyRoutes } from "./ontology.js";
import { registerVersionRoutes } from "./versions.js";
import { registerBackupRoutes } from "./backup.js";
import { registerRestoreRoutes } from "./restore.js";
import { registerBusinessRoutes } from "./businesses.js";
import { registerHarnessRoutes } from "./harness.js";
import { registerGatewayRoutes } from "./gateway.js";

export function registerAllRoutes(app: FastifyInstance): void {
  registerHealthRoutes(app);
  registerBusinessRoutes(app);
  registerHarnessRoutes(app);
  registerGatewayRoutes(app);

  for (const resource of SIMPLE_RESOURCES) {
    const repo = createNodeRepository(resource.label);
    const service = createOntologyService(repo, app.log);
    registerCrudRoutes(app, {
      path: resource.path,
      service,
      createSchema: resource.createSchema,
      updateSchema: resource.updateSchema
    });
  }

  registerCrudRoutes(app, {
    path: "relationships",
    service: createOntologyService(relationshipRepository as unknown as CrudRepository, app.log),
    createSchema: relationshipCreateSchema,
    updateSchema: relationshipUpdateSchema
  });

  registerCrudRoutes(app, {
    path: "handoffs",
    service: createOntologyService(handoffRepository as unknown as CrudRepository, app.log),
    createSchema: handoffCreateSchema,
    updateSchema: handoffUpdateSchema
  });

  registerVersionRoutes(app);
  registerOntologyRoutes(app);
  registerBackupRoutes(app);
  registerRestoreRoutes(app);
}

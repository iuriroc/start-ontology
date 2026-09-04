import type { FastifyInstance } from "fastify";
import { attachToVersionSchema, versionCreateSchema } from "@ontology-builder/shared";
import { recordAudit } from "../audit/auditLog.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { versionRepository } from "../repositories/versionRepository.js";
import { parseWith } from "../validators/parse.js";

/** OntologyVersion has its own lifecycle (draft -> published -> archived)
 * instead of the generic CRUD status enum, and published versions can never
 * be deleted (spec section 21), so it gets dedicated routes rather than the
 * generic CRUD factory. */
export function registerVersionRoutes(app: FastifyInstance): void {
  app.get("/versions", async () => ({ items: await versionRepository.list() }));

  app.get("/versions/:id", async (request) => {
    const { id } = request.params as { id: string };
    const version = await versionRepository.findById(id);
    if (!version) throw notFound("OntologyVersion", id);
    return version;
  });

  app.post("/versions", async (request, reply) => {
    const body = parseWith(versionCreateSchema, request.body);
    const created = await versionRepository.create(body);
    await recordAudit(
      { action: "CREATE", resourceType: "OntologyVersion", resourceId: created.id as string, result: "SUCCESS" },
      app.log
    );
    reply.code(201);
    return created;
  });

  app.get("/versions/:id/contents", async (request) => {
    const { id } = request.params as { id: string };
    const version = await versionRepository.findById(id);
    if (!version) throw notFound("OntologyVersion", id);
    return { items: await versionRepository.contents(id) };
  });

  app.post("/versions/:id/contents", async (request) => {
    const { id } = request.params as { id: string };
    const version = await versionRepository.findById(id);
    if (!version) throw notFound("OntologyVersion", id);
    if (version.status !== "DRAFT") {
      throw conflict("VERSION_NOT_DRAFT", "Elements can only be attached to a DRAFT version");
    }
    const body = parseWith(attachToVersionSchema, request.body);
    await versionRepository.attach(id, body.label, body.elementId);
    return { attached: true };
  });

  app.post("/versions/:id/publish", async (request) => {
    const { id } = request.params as { id: string };
    const version = await versionRepository.findById(id);
    if (!version) throw notFound("OntologyVersion", id);
    if (version.status !== "DRAFT") {
      throw badRequest("VERSION_NOT_DRAFT", "Only a DRAFT version can be published");
    }
    const updated = await versionRepository.setStatus(id, "PUBLISHED");
    await recordAudit(
      { action: "PUBLISH_VERSION", resourceType: "OntologyVersion", resourceId: id, result: "SUCCESS" },
      app.log
    );
    return updated;
  });

  app.post("/versions/:id/archive", async (request) => {
    const { id } = request.params as { id: string };
    const version = await versionRepository.findById(id);
    if (!version) throw notFound("OntologyVersion", id);
    const updated = await versionRepository.setStatus(id, "ARCHIVED");
    await recordAudit(
      { action: "ARCHIVE_VERSION", resourceType: "OntologyVersion", resourceId: id, result: "SUCCESS" },
      app.log
    );
    return updated;
  });

  app.delete("/versions/:id", async (request) => {
    const { id } = request.params as { id: string };
    const version = await versionRepository.findById(id);
    if (!version) throw notFound("OntologyVersion", id);
    if (version.status !== "DRAFT") {
      throw conflict("VERSION_PUBLISHED", "Published or archived versions cannot be deleted");
    }
    await versionRepository.deleteDraft(id);
    return { deleted: true };
  });
}

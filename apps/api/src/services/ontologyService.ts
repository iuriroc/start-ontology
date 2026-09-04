import type { FastifyBaseLogger } from "fastify";
import { recordAudit } from "../audit/auditLog.js";
import { conflict, notFound } from "../errors.js";
import type { ListOptions, NodeProps } from "../repositories/nodeRepository.js";

export interface CrudRepository {
  label: string;
  list(opts: ListOptions): Promise<NodeProps[]>;
  count(status?: string): Promise<number>;
  findById(id: string): Promise<NodeProps | null>;
  create(data: NodeProps): Promise<NodeProps>;
  update(id: string, data: NodeProps): Promise<NodeProps | null>;
  hardDelete(id: string): Promise<void>;
  relationshipCount(id: string): Promise<number>;
}

export interface DeleteOptions {
  hard?: boolean;
  force?: boolean;
}

/**
 * Wraps a repository with the cross-cutting rules every ontology resource
 * shares: 404s, audit logging, and the "warn before deleting something with
 * relationships, prefer soft delete" rule from spec section 30.
 */
export function createOntologyService(repo: CrudRepository, logger: FastifyBaseLogger) {
  const resourceName = repo.label;

  return {
    async list(opts: ListOptions) {
      const [items, total] = await Promise.all([repo.list(opts), repo.count(opts.status)]);
      return { items, total };
    },

    async get(id: string): Promise<NodeProps> {
      const found = await repo.findById(id);
      if (!found) throw notFound(resourceName, id);
      return found;
    },

    async create(data: NodeProps): Promise<NodeProps> {
      const created = await repo.create(data);
      await recordAudit(
        { action: "CREATE", resourceType: resourceName, resourceId: created.id as string, result: "SUCCESS" },
        logger
      );
      return created;
    },

    async update(id: string, data: NodeProps): Promise<NodeProps> {
      const existing = await repo.findById(id);
      if (!existing) throw notFound(resourceName, id);
      const updated = await repo.update(id, data);
      await recordAudit(
        { action: "UPDATE", resourceType: resourceName, resourceId: id, result: "SUCCESS" },
        logger
      );
      return updated!;
    },

    async remove(id: string, opts: DeleteOptions = {}): Promise<{ archived: boolean }> {
      const existing = await repo.findById(id);
      if (!existing) throw notFound(resourceName, id);

      const relCount = await repo.relationshipCount(id);
      if (relCount > 0 && !opts.force) {
        throw conflict(
          "ELEMENT_HAS_RELATIONSHIPS",
          `${resourceName} ${id} has ${relCount} relationship(s). Pass force=true to confirm deletion.`
        );
      }

      if (opts.hard) {
        await repo.hardDelete(id);
        await recordAudit(
          { action: "DELETE", resourceType: resourceName, resourceId: id, result: "SUCCESS" },
          logger
        );
        return { archived: false };
      }

      await repo.update(id, { status: "ARCHIVED" });
      await recordAudit(
        { action: "UPDATE", resourceType: resourceName, resourceId: id, result: "SUCCESS" },
        logger
      );
      return { archived: true };
    }
  };
}

export type OntologyService = ReturnType<typeof createOntologyService>;

import { randomUUID } from "node:crypto";
import type { RelationshipCreateInput, RelationshipUpdateInput } from "@ontology-builder/shared";
import { runQuery, withTransaction } from "../postgres/transaction.js";
import { createNodeRepository, type NodeProps } from "./nodeRepository.js";

const definitionRepo = createNodeRepository("RelationshipDefinition");

/**
 * A Relationship is stored two ways: a RelationshipDefinition row in
 * ontology_nodes (so it gets the same CRUD/list/versioning treatment as
 * every other ontology element) and, mirroring it, a real edge in
 * ontology_edges between the referenced source/target nodes (so the graph
 * view and SQL export show an actual Customer -[PERFORMED]-> Transaction
 * edge, per spec section 10). sourceLabel/targetLabel/type are always
 * validated against the fixed allowlist/regex in @ontology-builder/shared
 * before reaching this module.
 */
export const relationshipRepository = {
  label: definitionRepo.label,

  list: definitionRepo.list,
  count: definitionRepo.count,
  findById: definitionRepo.findById,
  relationshipCount: definitionRepo.relationshipCount,

  async create(data: RelationshipCreateInput & { name: string; description?: string; status: string }) {
    return withTransaction(async (client) => {
      const sourceExists = await runQuery(
        client,
        `SELECT id FROM ontology_nodes WHERE label = $1 AND id = $2`,
        [data.sourceLabel, data.sourceId]
      );
      if (sourceExists.rows.length === 0) {
        throw new Error(`source ${data.sourceLabel} ${data.sourceId} does not exist`);
      }
      const targetExists = await runQuery(
        client,
        `SELECT id FROM ontology_nodes WHERE label = $1 AND id = $2`,
        [data.targetLabel, data.targetId]
      );
      if (targetExists.rows.length === 0) {
        throw new Error(`target ${data.targetLabel} ${data.targetId} does not exist`);
      }

      const definition = await definitionRepo.create(data, client);

      await runQuery(
        client,
        `INSERT INTO ontology_edges (id, source_id, target_id, type, relationship_definition_id, cardinality)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (relationship_definition_id) WHERE relationship_definition_id IS NOT NULL
         DO UPDATE SET cardinality = EXCLUDED.cardinality`,
        [randomUUID(), data.sourceId, data.targetId, data.type, definition.id, data.cardinality]
      );

      return definition;
    });
  },

  async update(id: string, data: RelationshipUpdateInput): Promise<NodeProps | null> {
    if (!data.cardinality) {
      return definitionRepo.update(id, data);
    }
    return withTransaction(async (client) => {
      const updated = await definitionRepo.update(id, data, client);
      if (updated) {
        await runQuery(
          client,
          `UPDATE ontology_edges SET cardinality = $1 WHERE relationship_definition_id = $2`,
          [data.cardinality, id]
        );
      }
      return updated;
    });
  },

  async hardDelete(id: string): Promise<void> {
    // ontology_edges.relationship_definition_id has ON DELETE CASCADE, so
    // deleting the definition node also removes its mirror edge.
    await definitionRepo.hardDelete(id);
  }
};

import type { RelationshipCreateInput, RelationshipUpdateInput } from "@ontology-builder/shared";
import { getSession } from "../neo4j/driver.js";
import { createNodeRepository, type NodeProps } from "./nodeRepository.js";

const definitionRepo = createNodeRepository("RelationshipDefinition");

/**
 * A Relationship is stored two ways: a :RelationshipDefinition node (so it
 * gets the same CRUD/list/versioning treatment as every other ontology
 * element) and, mirroring it, a real typed edge between the referenced
 * source/target nodes (so the graph view and Cypher exports show an actual
 * `(Customer)-[:PERFORMED]->(Transaction)` relationship, per spec section 10).
 * sourceLabel/targetLabel/type are always validated against the fixed
 * allowlist/regex in @ontology-builder/shared before reaching this module,
 * so interpolating them into Cypher here is safe.
 */
export const relationshipRepository = {
  label: definitionRepo.label,

  list: definitionRepo.list,
  count: definitionRepo.count,
  findById: definitionRepo.findById,
  relationshipCount: definitionRepo.relationshipCount,

  async create(data: RelationshipCreateInput & { name: string; description?: string; status: string }) {
    const session = getSession();
    try {
      const sourceExists = await session.run(
        `MATCH (n:${data.sourceLabel} {id: $id}) RETURN n.id AS id`,
        { id: data.sourceId }
      );
      if (sourceExists.records.length === 0) {
        throw new Error(`source ${data.sourceLabel} ${data.sourceId} does not exist`);
      }
      const targetExists = await session.run(
        `MATCH (n:${data.targetLabel} {id: $id}) RETURN n.id AS id`,
        { id: data.targetId }
      );
      if (targetExists.records.length === 0) {
        throw new Error(`target ${data.targetLabel} ${data.targetId} does not exist`);
      }
    } finally {
      await session.close();
    }

    const definition = await definitionRepo.create(data);

    const edgeSession = getSession();
    try {
      await edgeSession.run(
        `MATCH (a:${data.sourceLabel} {id: $sourceId}), (b:${data.targetLabel} {id: $targetId})
         MERGE (a)-[r:${data.type} {relationshipDefinitionId: $defId}]->(b)
         SET r.cardinality = $cardinality`,
        {
          sourceId: data.sourceId,
          targetId: data.targetId,
          defId: definition.id,
          cardinality: data.cardinality
        }
      );
    } finally {
      await edgeSession.close();
    }

    return definition;
  },

  async update(id: string, data: RelationshipUpdateInput): Promise<NodeProps | null> {
    const updated = await definitionRepo.update(id, data);
    if (updated && data.cardinality) {
      const session = getSession();
      try {
        await session.run(
          `MATCH ()-[r {relationshipDefinitionId: $id}]->() SET r.cardinality = $cardinality`,
          { id, cardinality: data.cardinality }
        );
      } finally {
        await session.close();
      }
    }
    return updated;
  },

  async hardDelete(id: string): Promise<void> {
    const session = getSession();
    try {
      await session.run(`MATCH ()-[r {relationshipDefinitionId: $id}]->() DELETE r`, { id });
    } finally {
      await session.close();
    }
    await definitionRepo.hardDelete(id);
  }
};

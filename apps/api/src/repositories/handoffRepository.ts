import { randomUUID } from "node:crypto";
import type { HandoffCreateInput } from "@ontology-builder/shared";
import { runQuery, withTransaction } from "../postgres/transaction.js";
import { createNodeRepository, type NodeProps } from "./nodeRepository.js";

const baseRepo = createNodeRepository("Handoff");

/**
 * A Handoff row also gets FROM_AGENT/TO_AGENT edges to the referenced
 * Agent nodes so the graph view can render "Agent A -[HANDOFF_TO]->
 * Agent B" transitively via the Handoff node (spec section 17).
 */
export const handoffRepository = {
  label: baseRepo.label,
  list: baseRepo.list,
  count: baseRepo.count,
  findById: baseRepo.findById,
  update: baseRepo.update,
  relationshipCount: baseRepo.relationshipCount,
  hardDelete: baseRepo.hardDelete,

  async create(data: HandoffCreateInput & { name: string; description?: string; status: string }): Promise<NodeProps> {
    return withTransaction(async (client) => {
      for (const [role, agentId] of [
        ["from", data.fromAgentId],
        ["to", data.toAgentId]
      ] as const) {
        const exists = await runQuery(client, `SELECT id FROM ontology_nodes WHERE label = 'Agent' AND id = $1`, [
          agentId
        ]);
        if (exists.rows.length === 0) {
          throw new Error(`${role} agent ${agentId} does not exist`);
        }
      }

      const handoff = await baseRepo.create(data, client);

      await runQuery(
        client,
        `INSERT INTO ontology_edges (id, source_id, target_id, type)
         VALUES ($1, $2, $3, 'FROM_AGENT')
         ON CONFLICT (source_id, target_id, type) WHERE relationship_definition_id IS NULL DO NOTHING`,
        [randomUUID(), handoff.id, data.fromAgentId]
      );
      await runQuery(
        client,
        `INSERT INTO ontology_edges (id, source_id, target_id, type)
         VALUES ($1, $2, $3, 'TO_AGENT')
         ON CONFLICT (source_id, target_id, type) WHERE relationship_definition_id IS NULL DO NOTHING`,
        [randomUUID(), handoff.id, data.toAgentId]
      );

      return handoff;
    });
  }
};

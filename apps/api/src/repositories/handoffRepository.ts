import type { HandoffCreateInput } from "@ontology-builder/shared";
import { getSession } from "../neo4j/driver.js";
import { createNodeRepository, type NodeProps } from "./nodeRepository.js";

const baseRepo = createNodeRepository("Handoff");

/**
 * A Handoff node also gets FROM_AGENT/TO_AGENT edges to the referenced
 * Agent nodes so the graph view can render "Agent A -[:HANDOFF_TO]->
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
    const session = getSession();
    try {
      for (const [role, agentId] of [
        ["from", data.fromAgentId],
        ["to", data.toAgentId]
      ] as const) {
        const exists = await session.run(`MATCH (n:Agent {id: $id}) RETURN n.id AS id`, {
          id: agentId
        });
        if (exists.records.length === 0) {
          throw new Error(`${role} agent ${agentId} does not exist`);
        }
      }
    } finally {
      await session.close();
    }

    const handoff = await baseRepo.create(data);

    const edgeSession = getSession();
    try {
      await edgeSession.run(
        `MATCH (h:Handoff {id: $handoffId}), (from:Agent {id: $fromId}), (to:Agent {id: $toId})
         MERGE (h)-[:FROM_AGENT]->(from)
         MERGE (h)-[:TO_AGENT]->(to)`,
        { handoffId: handoff.id, fromId: data.fromAgentId, toId: data.toAgentId }
      );
    } finally {
      await edgeSession.close();
    }

    return handoff;
  }
};

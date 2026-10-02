import { randomUUID } from "node:crypto";
import { conflict, notFound } from "../errors.js";
import { runQuery, withTransaction } from "../postgres/transaction.js";
import { runWithTenant } from "../postgres/tenantContext.js";
import { businessRepository } from "../repositories/businessRepository.js";
import { guardrailRepository, toolRepository, evalCaseRepository } from "../repositories/harnessRepository.js";

/** Element types that define the ontology. Operational history (Issue,
 * Decision, Execution, LearningEvent), versions, audit and calls are NOT copied. */
const TEMPLATE_LABELS = [
  "Entity", "Concept", "RelationshipDefinition", "Rule", "State", "Capability", "Agent", "Policy", "Handoff"
] as const;

interface SourceData {
  nodes: Array<Record<string, any>>;
  edges: Array<Record<string, any>>;
  tools: Awaited<ReturnType<typeof toolRepository.list>>;
  guardrails: Awaited<ReturnType<typeof guardrailRepository.list>>;
  evalCases: Awaited<ReturnType<typeof evalCaseRepository.list>>;
}

/**
 * Copies the ontology definition and harness configuration (tools, guardrails,
 * evaluation cases) from one business into another EMPTY business, giving
 * every copied element a fresh id. Each side is read/written strictly inside
 * its own tenant context, so RLS still decides what each can touch.
 * API keys are never copied.
 */
export async function cloneBusiness(targetId: string, sourceId: string) {
  if (targetId === sourceId) throw conflict("CLONE_SAME_BUSINESS", "Origem e destino são o mesmo negócio");
  const [target, source] = await Promise.all([businessRepository.findById(targetId), businessRepository.findById(sourceId)]);
  if (!target) throw notFound("Business", targetId);
  if (!source) throw notFound("Business", sourceId);

  const data: SourceData = await runWithTenant({ businessId: sourceId }, async () => {
    const nodes = (
      await runQuery(undefined, `SELECT * FROM ontology_nodes WHERE label = ANY($1)
         AND NOT (label = 'Handoff' AND data->>'origin' = 'GATEWAY') ORDER BY created_at`, [[...TEMPLATE_LABELS]])
    ).rows;
    const ids = nodes.map((n) => n.id);
    const edges = (
      await runQuery(undefined, `SELECT * FROM ontology_edges WHERE source_id = ANY($1) AND target_id = ANY($1)`, [ids])
    ).rows;
    return {
      nodes,
      edges,
      tools: await toolRepository.list(),
      guardrails: await guardrailRepository.list(),
      evalCases: await evalCaseRepository.list()
    };
  });

  return runWithTenant({ businessId: targetId }, async () => {
    const existing = await runQuery<{ c: string }>(undefined, `SELECT count(*) AS c FROM ontology_nodes`);
    if (Number(existing.rows[0]!.c) > 0) {
      throw conflict("TARGET_NOT_EMPTY", "O negócio de destino já possui elementos; clone só para um negócio vazio");
    }

    const idMap = new Map<string, string>();
    for (const n of data.nodes) idMap.set(n.id, randomUUID());
    const remap = (id: unknown) => (typeof id === "string" ? idMap.get(id) ?? id : id);

    return withTransaction(async (client) => {
      for (const n of data.nodes) {
        const d = { ...(n.data as Record<string, unknown>) };
        for (const key of ["sourceId", "targetId", "fromAgentId", "toAgentId"]) if (key in d) d[key] = remap(d[key]);
        await client.query(
          `INSERT INTO ontology_nodes (id, label, name, description, status, domain, version, data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [idMap.get(n.id), n.label, n.name, n.description, n.status, n.domain, n.version, JSON.stringify(d)]
        );
      }
      for (const e of data.edges) {
        await client.query(
          `INSERT INTO ontology_edges (id, source_id, target_id, type, relationship_definition_id, cardinality)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), idMap.get(e.source_id), idMap.get(e.target_id), e.type,
           e.relationship_definition_id ? idMap.get(e.relationship_definition_id) : null, e.cardinality]
        );
      }
      for (const t of data.tools) {
        await toolRepository.create(
          { capabilityId: remap(t.capabilityId) as string, name: t.name, description: t.description ?? undefined,
            riskTier: t.riskTier, inputSchema: t.inputSchema, executor: t.executor, status: t.status },
          client
        );
      }
      for (const g of data.guardrails) {
        const appliesTo = { ...g.appliesTo, ...(g.appliesTo.agents ? { agents: g.appliesTo.agents.map(remap) } : {}) };
        const config = { ...g.config, ...(g.config.escalateToAgentId ? { escalateToAgentId: remap(g.config.escalateToAgentId) } : {}) };
        await guardrailRepository.create(
          { name: g.name, description: g.description ?? undefined, policyId: g.policyId ? (remap(g.policyId) as string) : undefined,
            kind: g.kind, appliesTo, config, priority: g.priority, status: g.status },
          client
        );
      }
      for (const c of data.evalCases) {
        await evalCaseRepository.create(
          { name: c.name, description: c.description ?? undefined, agentId: c.agentId ? (remap(c.agentId) as string) : undefined,
            toolName: c.toolName, args: c.args, context: c.context, expectedDecision: c.expectedDecision,
            expectedReason: c.expectedReason ?? undefined, status: c.status },
          client
        );
      }
      return {
        copied: {
          nodes: data.nodes.length, edges: data.edges.length, tools: data.tools.length,
          guardrails: data.guardrails.length, evalCases: data.evalCases.length
        }
      };
    });
  });
}

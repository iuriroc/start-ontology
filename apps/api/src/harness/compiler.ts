import { createHash } from "node:crypto";
import type { OntologyLabel } from "@ontology-builder/shared";
import { runQuery } from "../postgres/transaction.js";
import { requireBusinessId } from "../postgres/tenantContext.js";
import { businessRepository } from "../repositories/businessRepository.js";
import { createNodeRepository, type NodeProps } from "../repositories/nodeRepository.js";
import { guardrailRepository, toolRepository } from "../repositories/harnessRepository.js";
import { versionRepository } from "../repositories/versionRepository.js";
import { stableStringify } from "./stableJson.js";

const BIG = 1_000_000;

export interface BundleAgent {
  id: string;
  name: string;
  role?: string;
  description?: string;
  capabilities: string[];
  tools: string[];
  policies: string[];
}

export interface Bundle {
  schemaVersion: 1;
  business: { id: string; slug: string; name: string };
  ontologyVersion: string | null;
  domain: {
    entities: NodeProps[];
    concepts: NodeProps[];
    relationships: NodeProps[];
    states: NodeProps[];
    rules: NodeProps[];
  };
  policies: NodeProps[];
  capabilities: NodeProps[];
  agents: BundleAgent[];
  tools: Array<{ name: string; description: string | null; riskTier: string; capability: string; inputSchema: unknown; executor: string }>;
  guardrails: Array<{ id: string; name: string; kind: string; appliesTo: unknown; config: unknown; priority: number }>;
  handoffs: NodeProps[];
}

export interface CompiledBundle {
  checksum: string;
  compiledAt: string;
  bundle: Bundle;
}

const strip = (n: NodeProps): NodeProps => {
  const { createdAt: _c, updatedAt: _u, ...rest } = n;
  return rest;
};

/**
 * Compiles the CURRENT business's ontology into the package an agent runtime
 * loads: only ACTIVE elements (or exactly the members of `versionId`), the
 * agents with the capabilities/tools they were actually granted, and the
 * enforceable guardrails. Tool executor details (URLs, headers) are never
 * included — the model gets contracts, the gateway keeps the plumbing.
 * Everything is read through RLS, so the output can only contain this
 * business's data. The checksum is over the content only (not compiledAt).
 */
export async function compileBundle(versionId?: string): Promise<CompiledBundle> {
  const businessId = requireBusinessId();
  const business = await businessRepository.findById(businessId);
  if (!business) throw new Error("business not found");

  let memberIds: Set<string> | undefined;
  let ontologyVersion: string | null = null;
  if (versionId) {
    const v = await versionRepository.findById(versionId);
    if (!v) throw new Error("version not found");
    ontologyVersion = v.version as string;
    memberIds = new Set((await versionRepository.contents(versionId)).map((c) => c.id));
  } else {
    const latest = await runQuery<{ version: string }>(
      undefined,
      `SELECT version FROM ontology_versions WHERE status = 'PUBLISHED' ORDER BY created_at DESC LIMIT 1`
    );
    ontologyVersion = latest.rows[0]?.version ?? null;
  }

  const load = async (label: OntologyLabel): Promise<NodeProps[]> => {
    const all = await createNodeRepository(label).list({
      limit: BIG,
      offset: 0,
      ...(memberIds ? {} : { status: "ACTIVE" })
    });
    const filtered = memberIds ? all.filter((n) => memberIds!.has(n.id as string)) : all;
    return filtered.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  };

  const [entities, concepts, relationships, states, rules, policies, capabilities, agents, handoffs] = await Promise.all([
    load("Entity"), load("Concept"), load("RelationshipDefinition"), load("State"), load("Rule"),
    load("Policy"), load("Capability"), load("Agent"), load("Handoff")
  ]);
  // Handoffs the gateway opened at runtime are operational records, not ontology.
  const handoffDefinitions = handoffs.filter((h) => h.origin !== "GATEWAY");

  const edges = await runQuery<{ type: string; source_id: string; target_id: string }>(
    undefined,
    `SELECT type, source_id, target_id FROM ontology_edges WHERE type IN ('HAS_CAPABILITY','GOVERNED_BY')`
  );
  const capById = new Map(capabilities.map((c) => [c.id as string, c]));
  const polById = new Map(policies.map((p) => [p.id as string, p]));

  const tools = (await toolRepository.list()).filter((t) => t.status === "ACTIVE" && capById.has(t.capabilityId));
  const guardrails = (await guardrailRepository.list()).filter((g) => g.status === "ACTIVE");

  const bundleAgents: BundleAgent[] = agents.map((a) => {
    const capIds = edges.rows.filter((e) => e.type === "HAS_CAPABILITY" && e.source_id === a.id).map((e) => e.target_id);
    const polIds = edges.rows.filter((e) => e.type === "GOVERNED_BY" && e.source_id === a.id).map((e) => e.target_id);
    return {
      id: a.id as string,
      name: a.name as string,
      role: a.role as string | undefined,
      description: a.description as string | undefined,
      capabilities: capIds.map((id) => capById.get(id)?.name as string).filter(Boolean).sort(),
      tools: tools.filter((t) => capIds.includes(t.capabilityId)).map((t) => t.name).sort(),
      policies: polIds.map((id) => polById.get(id)?.name as string).filter(Boolean).sort()
    };
  });

  const bundle: Bundle = {
    schemaVersion: 1,
    business: { id: business.id, slug: business.slug, name: business.name },
    ontologyVersion,
    domain: {
      entities: entities.map(strip),
      concepts: concepts.map(strip),
      relationships: relationships.map(strip),
      states: states.map(strip),
      rules: rules.map(strip)
    },
    policies: policies.map(strip),
    capabilities: capabilities.map(strip),
    agents: bundleAgents,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      riskTier: t.riskTier,
      capability: t.capabilityName ?? String(capById.get(t.capabilityId)?.name ?? ""),
      inputSchema: t.inputSchema,
      executor: t.executor.type
    })),
    guardrails: guardrails.map((g) => ({
      id: g.id, name: g.name, kind: g.kind, appliesTo: g.appliesTo, config: g.config, priority: g.priority
    })),
    handoffs: handoffDefinitions.map(strip)
  };

  const checksum = createHash("sha256").update(stableStringify(bundle)).digest("hex");
  return { checksum, compiledAt: new Date().toISOString(), bundle };
}

/** Renders the system-prompt context for one agent from a compiled bundle. */
export function renderAgentContext(bundle: Bundle, agentRef: string): string | null {
  const agent = bundle.agents.find((a) => a.id === agentRef || a.name === agentRef);
  if (!agent) return null;
  const tools = bundle.tools.filter((t) => agent.tools.includes(t.name));
  const applicable = bundle.guardrails.filter((g) => {
    const at = g.appliesTo as { tools?: string[]; agents?: string[] };
    const toolOk = !at.tools?.length || at.tools.some((t) => agent.tools.includes(t));
    const agentOk = !at.agents?.length || at.agents.includes(agent.id);
    return toolOk && agentOk;
  });
  const lines: string[] = [
    `# Você é ${agent.name}${agent.role ? ` — ${agent.role}` : ""}`,
    `Negócio: ${bundle.business.name} (${bundle.business.slug}). Opere somente dentro deste negócio.`,
    agent.description ? `\n${agent.description}` : "",
    "\n## Ferramentas permitidas",
    ...(tools.length
      ? tools.map((t) => `- \`${t.name}\` (risco ${t.riskTier}): ${t.description ?? ""}\n  entrada: ${JSON.stringify(t.inputSchema)}`)
      : ["- nenhuma"]),
    "\nToda chamada passa pelo gateway; ele pode negar, pedir verificação ou escalar para humano. Nunca tente contornar uma negação.",
    "\n## Guardrails que se aplicam a você",
    ...(applicable.length ? applicable.map((g) => `- [${g.kind}] ${g.name}: ${JSON.stringify(g.config)}`) : ["- nenhum"]),
    "\n## Diretrizes",
    ...(agent.policies.length ? agent.policies.map((p) => `- ${p}`) : ["- nenhuma"]),
    "\n## Regras de negócio",
    ...(bundle.domain.rules.length
      ? bundle.domain.rules.map((r) => `- ${r.name}: SE ${r.condition ?? "?"} ENTÃO ${r.action ?? "?"}`)
      : ["- nenhuma"]),
    "\n## Cadastros do domínio",
    ...(bundle.domain.entities.length ? bundle.domain.entities.map((e) => `- ${e.name}${e.description ? `: ${e.description}` : ""}`) : ["- nenhum"])
  ];
  return lines.filter((l) => l !== "").join("\n");
}

import type { GatewayCallInput, GatewayDecision } from "@ontology-builder/shared";
import { businessSettingsSchema } from "@ontology-builder/shared";
import { runQuery } from "../postgres/transaction.js";
import { isUuid, requireBusinessId } from "../postgres/tenantContext.js";
import { businessRepository } from "../repositories/businessRepository.js";
import { callRepository, guardrailRepository, toolRepository } from "../repositories/harnessRepository.js";
import { handoffRepository } from "../repositories/handoffRepository.js";
import { createNodeRepository } from "../repositories/nodeRepository.js";
import { evaluateCall, type EvaluatedGuardrail, type Evaluation, type Reason } from "./evaluator.js";
import { ExecutorError, executeTool } from "./executor.js";
import { redact } from "./redact.js";

const agentRepo = createNodeRepository("Agent");

export interface GatewayResult {
  callId: string;
  decision: GatewayDecision;
  reasons: Reason[];
  evaluated: EvaluatedGuardrail[];
  executed: boolean;
  result?: unknown;
  error?: string;
  handoffId?: string;
  mode: "LIVE" | "DRY_RUN" | "EVAL";
}

export interface GatewayOptions {
  /** True for /gateway/execute: ALLOWed calls with an executor are performed. */
  execute: boolean;
  /** Marks the audit row as an evaluation run. Implies no execution/handoff. */
  asEval?: boolean;
}

async function resolveAgent(ref: string): Promise<{ id: string; name: string } | null> {
  const node = isUuid(ref) ? await agentRepo.findById(ref) : await agentRepo.findByName(ref);
  return node ? { id: node.id as string, name: node.name as string } : null;
}

async function hasGrant(agentId: string, capabilityId: string): Promise<boolean> {
  const r = await runQuery(
    undefined,
    `SELECT 1 FROM ontology_edges WHERE type = 'HAS_CAPABILITY' AND source_id = $1 AND target_id = $2 LIMIT 1`,
    [agentId, capabilityId]
  );
  return r.rows.length > 0;
}

async function latestBundleChecksum(): Promise<string | undefined> {
  const r = await runQuery<{ checksum: string }>(undefined, `SELECT checksum FROM harness_bundles ORDER BY created_at DESC LIMIT 1`);
  return r.rows[0]?.checksum;
}

/**
 * The gateway: every agent action goes through here. It resolves agent and
 * tool inside the current business (RLS), asks the pure evaluator for a
 * decision, optionally opens a Handoff on ESCALATE, optionally executes the
 * tool, and appends an immutable, redacted audit row. Unknown agent/tool
 * resolve to DENY, never to an error that could be mistaken for success.
 */
export async function processGatewayCall(input: GatewayCallInput, opts: GatewayOptions): Promise<GatewayResult> {
  const started = Date.now();
  const business = await businessRepository.findById(requireBusinessId());
  const settings = businessSettingsSchema.parse(business?.settings ?? {});
  const sensitive = settings.sensitiveKeys;
  const dryRun = input.dryRun || Boolean(opts.asEval);
  const mode: GatewayResult["mode"] = opts.asEval ? "EVAL" : dryRun ? "DRY_RUN" : "LIVE";

  const agent = await resolveAgent(input.agent);
  const tool = await toolRepository.findByName(input.tool);

  let evaluation: Evaluation;
  if (!agent) {
    evaluation = {
      decision: "DENY",
      reasons: [{ code: "AGENT_NOT_FOUND", message: `Agente '${input.agent}' não existe neste negócio` }],
      evaluated: []
    };
  } else if (!tool) {
    evaluation = {
      decision: "DENY",
      reasons: [{ code: "TOOL_NOT_FOUND", message: `Ferramenta '${input.tool}' não existe neste negócio` }],
      evaluated: []
    };
  } else {
    evaluation = evaluateCall({
      agent,
      tool,
      granted: await hasGrant(agent.id, tool.capabilityId),
      args: input.args,
      context: input.context,
      guardrails: await guardrailRepository.list()
    });
  }

  let handoffId: string | undefined;
  if (evaluation.decision === "ESCALATE" && !dryRun && agent && evaluation.escalateToAgentId) {
    try {
      const handoff = await handoffRepository.create({
        name: `Escalonamento: ${input.tool} (${agent.name})`,
        description: evaluation.reasons.map((r) => r.message).join(" | "),
        status: "ACTIVE",
        fromAgentId: agent.id,
        toAgentId: evaluation.escalateToAgentId,
        reason: evaluation.reasons[0]?.code,
        priority: 0,
        // Runtime record, not ontology definition: kept out of compiled bundles and clones.
        origin: "GATEWAY"
      } as never);
      handoffId = handoff.id as string;
    } catch {
      /* target agent gone: the ESCALATE decision and audit row still stand */
    }
  }

  let executed = false;
  let result: unknown;
  let error: string | undefined;
  if (evaluation.decision === "ALLOW" && opts.execute && !dryRun && tool && tool.executor.type !== "none") {
    try {
      result = await executeTool(tool.executor as never, input.args, settings);
      executed = true;
    } catch (err) {
      error = err instanceof ExecutorError ? `${err.code}: ${err.message}` : `EXECUTION_FAILED: ${(err as Error).message}`;
    }
  }

  const callId = await callRepository.insert({
    mode,
    sessionId: input.context.sessionId,
    agentId: agent?.id,
    agentName: agent?.name ?? input.agent,
    toolName: input.tool,
    args: redact(input.args, sensitive),
    context: redact(input.context, sensitive),
    decision: evaluation.decision,
    reasons: evaluation.reasons,
    evaluated: evaluation.evaluated,
    handoffId,
    executed,
    result: result === undefined ? undefined : redact(result, sensitive),
    error,
    durationMs: Date.now() - started,
    bundleChecksum: await latestBundleChecksum()
  });

  return {
    callId, decision: evaluation.decision, reasons: evaluation.reasons, evaluated: evaluation.evaluated,
    executed, result, error, handoffId, mode
  };
}

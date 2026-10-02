import { Ajv } from "ajv";
import type { GatewayDecision, ReasonCode } from "@ontology-builder/shared";
import type { GuardrailRow, ToolRow } from "../repositories/harnessRepository.js";

export interface Reason {
  code: ReasonCode;
  message: string;
  guardrailId?: string;
  guardrailName?: string;
  details?: Record<string, unknown>;
}

export interface EvaluatedGuardrail {
  guardrailId: string;
  name: string;
  kind: GuardrailRow["kind"];
  outcome: "PASS" | "DENY" | "ESCALATE";
}

export interface Evaluation {
  decision: GatewayDecision;
  reasons: Reason[];
  evaluated: EvaluatedGuardrail[];
  /** Agent that should receive the handoff when decision is ESCALATE. */
  escalateToAgentId?: string;
}

export interface EvaluationInput {
  agent: { id: string; name: string };
  tool: Pick<ToolRow, "name" | "status" | "riskTier" | "inputSchema">;
  /** Does the agent hold a HAS_CAPABILITY edge to the tool's capability? */
  granted: boolean;
  args: Record<string, unknown>;
  context: { verifiedFactors?: string[]; approval?: { approvedBy: string } };
  guardrails: GuardrailRow[];
}

const ajv = new Ajv({ allErrors: true, strict: false });

function applies(g: GuardrailRow, input: EvaluationInput): boolean {
  const { tools, agents, riskTiers } = g.appliesTo;
  if (tools?.length && !tools.includes(input.tool.name)) return false;
  if (agents?.length && !agents.includes(input.agent.id)) return false;
  if (riskTiers?.length && !riskTiers.includes(input.tool.riskTier)) return false;
  return true;
}

/**
 * Pure decision function of the gateway — no I/O, so it is unit-testable and
 * identical for live calls, dry runs and evaluation cases. Deny-by-default:
 * a call is ALLOWed only if the tool is active, the agent was granted the
 * tool's capability, the args match the contract and no guardrail objects.
 * Precedence: any DENY wins over ESCALATE, which wins over ALLOW.
 */
export function evaluateCall(input: EvaluationInput): Evaluation {
  const reasons: Reason[] = [];
  const evaluated: EvaluatedGuardrail[] = [];
  let escalateToAgentId: string | undefined;

  if (input.tool.status !== "ACTIVE") {
    reasons.push({ code: "TOOL_DISABLED", message: `A ferramenta ${input.tool.name} está desativada` });
  }
  if (!input.granted) {
    reasons.push({
      code: "NO_CAPABILITY_GRANT",
      message: `O agente ${input.agent.name} não possui a habilidade desta ferramenta (HAS_CAPABILITY)`
    });
  }

  const validate = ajv.compile(input.tool.inputSchema);
  if (!validate(input.args)) {
    reasons.push({
      code: "INVALID_ARGUMENTS",
      message: "Argumentos fora do contrato da ferramenta",
      details: { errors: (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`) }
    });
  }

  const ordered = [...input.guardrails]
    .filter((g) => g.status === "ACTIVE" && applies(g, input))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

  let sawEscalate = false;
  for (const g of ordered) {
    const base = { guardrailId: g.id, guardrailName: g.name };
    const record = (outcome: EvaluatedGuardrail["outcome"]) =>
      evaluated.push({ guardrailId: g.id, name: g.name, kind: g.kind, outcome });

    if (g.kind === "DENY") {
      record("DENY");
      reasons.push({ ...base, code: "GUARDRAIL_DENY", message: (g.config.reason as string) || `Bloqueado pela diretriz ${g.name}` });
    } else if (g.kind === "REQUIRE_VERIFICATION") {
      const required = (g.config.factors as string[]) ?? [];
      const min = (g.config.minFactors as number | undefined) ?? required.length;
      const verified = new Set((input.context.verifiedFactors ?? []).map((f) => f.toLowerCase()));
      const have = required.filter((f) => verified.has(f.toLowerCase()));
      if (have.length < min) {
        record("DENY");
        reasons.push({
          ...base,
          code: "VERIFICATION_REQUIRED",
          message: `Pré-verificação incompleta: ${have.length} de ${min} fatores confirmados`,
          details: { missing: required.filter((f) => !verified.has(f.toLowerCase())) }
        });
      } else record("PASS");
    } else if (g.kind === "LIMIT") {
      const param = g.config.param as string;
      const max = g.config.max as number;
      const value = input.args[param];
      if (typeof value === "number" && value > max) {
        const onExceed = (g.config.onExceed as "DENY" | "ESCALATE" | undefined) ?? "DENY";
        record(onExceed);
        reasons.push({
          ...base,
          code: "LIMIT_EXCEEDED",
          message: `${param}=${value} excede o limite de ${max}`,
          details: { param, value, max, onExceed }
        });
        if (onExceed === "ESCALATE") {
          sawEscalate = true;
          escalateToAgentId ??= g.config.escalateToAgentId as string | undefined;
        }
      } else record("PASS");
    } else if (g.kind === "REQUIRE_APPROVAL") {
      if (input.context.approval?.approvedBy) record("PASS");
      else {
        record("ESCALATE");
        sawEscalate = true;
        escalateToAgentId ??= g.config.escalateToAgentId as string | undefined;
        reasons.push({
          ...base,
          code: "APPROVAL_REQUIRED",
          message: (g.config.reason as string) || "Requer aprovação humana antes de executar"
        });
      }
    }
  }

  const denied =
    reasons.some((r) => ["TOOL_DISABLED", "NO_CAPABILITY_GRANT", "INVALID_ARGUMENTS", "GUARDRAIL_DENY", "VERIFICATION_REQUIRED"].includes(r.code)) ||
    evaluated.some((e) => e.outcome === "DENY");
  if (denied) return { decision: "DENY", reasons, evaluated };
  if (sawEscalate) return { decision: "ESCALATE", reasons, evaluated, escalateToAgentId };
  return { decision: "ALLOW", reasons, evaluated };
}

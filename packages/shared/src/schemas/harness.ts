import { z } from "zod";
import { descriptionSchema, idSchema, nameSchema } from "./common.js";

export const RiskTier = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type RiskTier = z.infer<typeof RiskTier>;

export const GatewayDecision = z.enum(["ALLOW", "DENY", "ESCALATE"]);
export type GatewayDecision = z.infer<typeof GatewayDecision>;

export const toolNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_.-]{0,99}$/, "nome da ferramenta: minúsculas, números, '.', '_' ou '-' (ex.: refund.request)");

/** How the gateway performs a tool. `none` = authorize only (the agent runtime
 * does the work itself); `mock` = fixed response (tests/evals); `http` =
 * the gateway calls the system, restricted to the business's allowedHosts. */
export const executorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("mock"), response: z.unknown().optional() }),
  z.object({
    type: z.literal("http"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    /** May contain {param} placeholders filled (URL-encoded) from the call args. */
    url: z.string().url().max(2000),
    /** Header values may reference ${ENV:HARNESS_*} so secrets stay out of the database. */
    headers: z.record(z.string().max(1000)).optional(),
    timeoutMs: z.number().int().min(100).max(30000).default(10000)
  })
]);
export type Executor = z.infer<typeof executorSchema>;

export const toolCreateSchema = z.object({
  capabilityId: idSchema,
  name: toolNameSchema,
  description: descriptionSchema,
  riskTier: RiskTier.default("LOW"),
  inputSchema: z.record(z.unknown()).default({ type: "object", properties: {} }),
  executor: executorSchema.default({ type: "none" }),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE")
});
export type ToolCreateInput = z.infer<typeof toolCreateSchema>;
export const toolUpdateSchema = toolCreateSchema.omit({ capabilityId: true }).partial();
export type ToolUpdateInput = z.infer<typeof toolUpdateSchema>;

export const guardrailAppliesToSchema = z.object({
  tools: z.array(toolNameSchema).optional(),
  agents: z.array(idSchema).optional(),
  riskTiers: z.array(RiskTier).optional()
});
export type GuardrailAppliesTo = z.infer<typeof guardrailAppliesToSchema>;

const guardrailBase = {
  name: nameSchema,
  description: descriptionSchema,
  policyId: idSchema.optional(),
  appliesTo: guardrailAppliesToSchema.default({}),
  priority: z.number().int().min(0).max(1000).default(0),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE")
};

export const guardrailCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    ...guardrailBase,
    kind: z.literal("DENY"),
    config: z.object({ reason: z.string().max(500).optional() }).default({})
  }),
  z.object({
    ...guardrailBase,
    kind: z.literal("REQUIRE_VERIFICATION"),
    config: z.object({
      /** Factor ids the trusted runtime must report as verified (e.g. cpf, name, card_last4). */
      factors: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
      /** Defaults to all factors. */
      minFactors: z.number().int().min(1).max(20).optional()
    })
  }),
  z.object({
    ...guardrailBase,
    kind: z.literal("LIMIT"),
    config: z.object({
      param: z.string().trim().min(1).max(100),
      max: z.number(),
      onExceed: z.enum(["DENY", "ESCALATE"]).default("DENY"),
      escalateToAgentId: idSchema.optional()
    })
  }),
  z.object({
    ...guardrailBase,
    kind: z.literal("REQUIRE_APPROVAL"),
    config: z
      .object({ escalateToAgentId: idSchema.optional(), reason: z.string().max(500).optional() })
      .default({})
  })
]);
export type GuardrailCreateInput = z.infer<typeof guardrailCreateSchema>;
export const guardrailUpdateSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema,
  policyId: idSchema.nullable().optional(),
  appliesTo: guardrailAppliesToSchema.optional(),
  config: z.record(z.unknown()).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional()
});
export type GuardrailUpdateInput = z.infer<typeof guardrailUpdateSchema>;

/** Context set by the TRUSTED runtime (not by the model): who is the session,
 * which verification factors it actually verified, whether a human approved. */
export const callContextSchema = z
  .object({
    sessionId: z.string().max(200).optional(),
    verifiedFactors: z.array(z.string().max(60)).max(50).optional(),
    approval: z.object({ approvedBy: z.string().min(1).max(200) }).optional()
  })
  .passthrough();
export type CallContext = z.infer<typeof callContextSchema>;

export const gatewayCallSchema = z.object({
  /** Agent id (uuid) or exact agent name. */
  agent: z.string().trim().min(1).max(200),
  tool: toolNameSchema,
  args: z.record(z.unknown()).default({}),
  context: callContextSchema.default({}),
  /** Evaluate and log only; never executes and never opens a handoff. */
  dryRun: z.boolean().default(false)
});
export type GatewayCallInput = z.infer<typeof gatewayCallSchema>;

export const evalCaseCreateSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  agentId: idSchema.optional(),
  toolName: toolNameSchema,
  args: z.record(z.unknown()).default({}),
  context: callContextSchema.default({}),
  expectedDecision: GatewayDecision,
  /** Optional reason code the decision must include (e.g. VERIFICATION_REQUIRED). */
  expectedReason: z.string().max(100).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE")
});
export type EvalCaseCreateInput = z.infer<typeof evalCaseCreateSchema>;
export const evalCaseUpdateSchema = evalCaseCreateSchema.partial();

export const apiKeyCreateSchema = z.object({ name: nameSchema });
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

export const REASON_CODES = [
  "TOOL_NOT_FOUND",
  "AGENT_NOT_FOUND",
  "TOOL_DISABLED",
  "NO_CAPABILITY_GRANT",
  "INVALID_ARGUMENTS",
  "GUARDRAIL_DENY",
  "VERIFICATION_REQUIRED",
  "LIMIT_EXCEEDED",
  "APPROVAL_REQUIRED"
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

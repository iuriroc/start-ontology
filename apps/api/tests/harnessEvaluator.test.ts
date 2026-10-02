import { describe, expect, it } from "vitest";
import { evaluateCall, type EvaluationInput } from "../src/harness/evaluator.js";
import { redact } from "../src/harness/redact.js";
import type { GuardrailRow } from "../src/repositories/harnessRepository.js";

const guardrail = (g: Partial<GuardrailRow> & Pick<GuardrailRow, "kind" | "config">): GuardrailRow => ({
  id: crypto.randomUUID(), policyId: null, name: g.kind + Math.random(), description: null,
  appliesTo: {}, priority: 0, status: "ACTIVE", createdAt: "", updatedAt: "", ...g
});

const base = (over: Partial<EvaluationInput> = {}): EvaluationInput => ({
  agent: { id: "a1", name: "Chat N1" },
  tool: { name: "refund.request", status: "ACTIVE", riskTier: "MEDIUM", inputSchema: { type: "object", properties: { amount: { type: "number" } }, required: ["amount"] } },
  granted: true,
  args: { amount: 50 },
  context: {},
  guardrails: [],
  ...over
});

describe("evaluateCall (deny by default)", () => {
  it("allows a granted, valid call with no objecting guardrail", () => {
    expect(evaluateCall(base()).decision).toBe("ALLOW");
  });
  it("denies when the agent lacks the capability grant", () => {
    const r = evaluateCall(base({ granted: false }));
    expect(r.decision).toBe("DENY");
    expect(r.reasons.map((x) => x.code)).toContain("NO_CAPABILITY_GRANT");
  });
  it("denies a disabled tool and invalid arguments", () => {
    expect(evaluateCall(base({ tool: { ...base().tool, status: "DISABLED" } })).reasons[0]!.code).toBe("TOOL_DISABLED");
    const bad = evaluateCall(base({ args: { amount: "muito" } }));
    expect(bad.decision).toBe("DENY");
    expect(bad.reasons[0]!.code).toBe("INVALID_ARGUMENTS");
  });
  it("requires ALL verification factors the trusted runtime reported", () => {
    const g = guardrail({ kind: "REQUIRE_VERIFICATION", config: { factors: ["cpf", "name", "card_last4"] } });
    const missing = evaluateCall(base({ guardrails: [g], context: { verifiedFactors: ["cpf", "name"] } }));
    expect(missing.decision).toBe("DENY");
    expect(missing.reasons[0]).toMatchObject({ code: "VERIFICATION_REQUIRED", details: { missing: ["card_last4"] } });
    const ok = evaluateCall(base({ guardrails: [g], context: { verifiedFactors: ["CPF", "Name", "card_last4"] } }));
    expect(ok.decision).toBe("ALLOW");
  });
  it("DENY guardrails scoped by tool and agent only apply there", () => {
    const g = guardrail({ kind: "DENY", config: {}, appliesTo: { tools: ["refund.execute"] } });
    expect(evaluateCall(base({ guardrails: [g] })).decision).toBe("ALLOW");
    const exec = base({ guardrails: [g], tool: { ...base().tool, name: "refund.execute" } });
    expect(evaluateCall(exec).decision).toBe("DENY");
  });
  it("LIMIT can deny or escalate, and approval lifts REQUIRE_APPROVAL", () => {
    const esc = guardrail({ kind: "LIMIT", config: { param: "amount", max: 100, onExceed: "ESCALATE", escalateToAgentId: "human" } });
    const r = evaluateCall(base({ guardrails: [esc], args: { amount: 500 } }));
    expect(r).toMatchObject({ decision: "ESCALATE", escalateToAgentId: "human" });
    const deny = guardrail({ kind: "LIMIT", config: { param: "amount", max: 100, onExceed: "DENY" } });
    expect(evaluateCall(base({ guardrails: [deny], args: { amount: 500 } })).decision).toBe("DENY");
    const appr = guardrail({ kind: "REQUIRE_APPROVAL", config: {} });
    expect(evaluateCall(base({ guardrails: [appr] })).decision).toBe("ESCALATE");
    expect(evaluateCall(base({ guardrails: [appr], context: { approval: { approvedBy: "maria" } } })).decision).toBe("ALLOW");
  });
  it("DENY wins over ESCALATE", () => {
    const esc = guardrail({ kind: "REQUIRE_APPROVAL", config: {} });
    const deny = guardrail({ kind: "DENY", config: {} });
    expect(evaluateCall(base({ guardrails: [esc, deny] })).decision).toBe("DENY");
  });
  it("ignores DISABLED guardrails", () => {
    const g = guardrail({ kind: "DENY", config: {}, status: "DISABLED" });
    expect(evaluateCall(base({ guardrails: [g] })).decision).toBe("ALLOW");
  });
});

describe("redact", () => {
  it("masks sensitive keys at any depth and keeps the rest", () => {
    const out = redact({ cpf: "123", nested: { cardNumber: "4111", ok: 1 }, list: [{ senha: "x" }] }, ["custom"]) as any;
    expect(out.cpf).toBe("[REDACTED]");
    expect(out.nested.cardNumber).toBe("[REDACTED]");
    expect(out.nested.ok).toBe(1);
    expect(out.list[0].senha).toBe("[REDACTED]");
    expect((redact({ myCustomKey: 1 }, ["custom"]) as any).myCustomKey).toBe("[REDACTED]");
  });
});

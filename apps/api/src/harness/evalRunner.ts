import { evalCaseRepository, evalRunRepository } from "../repositories/harnessRepository.js";
import { processGatewayCall } from "./gateway.js";

export interface EvalCaseResult {
  caseId: string;
  name: string;
  expected: { decision: string; reason?: string | null };
  actual: { decision: string; reasons: string[] };
  passed: boolean;
}

/** Runs every ACTIVE evaluation case through the real gateway in EVAL mode
 * (decision only — nothing executes, no handoffs) and stores the run. */
export async function runEvaluation() {
  const cases = (await evalCaseRepository.list()).filter((c) => c.status === "ACTIVE");
  const results: EvalCaseResult[] = [];
  for (const c of cases) {
    const out = await processGatewayCall(
      {
        agent: c.agentId ?? "",
        tool: c.toolName,
        args: c.args,
        context: c.context,
        dryRun: true
      },
      { execute: false, asEval: true }
    );
    const codes = out.reasons.map((r) => r.code as string);
    const passed = out.decision === c.expectedDecision && (!c.expectedReason || codes.includes(c.expectedReason));
    results.push({
      caseId: c.id,
      name: c.name,
      expected: { decision: c.expectedDecision, reason: c.expectedReason },
      actual: { decision: out.decision, reasons: codes },
      passed
    });
  }
  const passed = results.filter((r) => r.passed).length;
  return evalRunRepository.insert({ total: results.length, passed, failed: results.length - passed, results });
}

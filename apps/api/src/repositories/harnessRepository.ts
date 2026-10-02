import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { runQuery, type Queryable } from "../postgres/transaction.js";

export interface ToolRow {
  id: string;
  capabilityId: string;
  capabilityName?: string;
  name: string;
  description: string | null;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  inputSchema: Record<string, unknown>;
  executor: Record<string, unknown> & { type: "none" | "mock" | "http" };
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  updatedAt: string;
}

export interface GuardrailRow {
  id: string;
  policyId: string | null;
  name: string;
  description: string | null;
  kind: "DENY" | "REQUIRE_VERIFICATION" | "LIMIT" | "REQUIRE_APPROVAL";
  appliesTo: { tools?: string[]; agents?: string[]; riskTiers?: string[] };
  config: Record<string, unknown>;
  priority: number;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  updatedAt: string;
}

export interface EvalCaseRow {
  id: string;
  name: string;
  description: string | null;
  agentId: string | null;
  toolName: string;
  args: Record<string, unknown>;
  context: Record<string, unknown>;
  expectedDecision: "ALLOW" | "DENY" | "ESCALATE";
  expectedReason: string | null;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
}

const iso = (d: Date) => d.toISOString();

function toolFromRow(r: QueryResultRow): ToolRow {
  return {
    id: r.id,
    capabilityId: r.capability_id,
    capabilityName: r.capability_name ?? undefined,
    name: r.name,
    description: r.description,
    riskTier: r.risk_tier,
    inputSchema: r.input_schema,
    executor: r.executor,
    status: r.status,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at)
  };
}

function guardrailFromRow(r: QueryResultRow): GuardrailRow {
  return {
    id: r.id,
    policyId: r.policy_id,
    name: r.name,
    description: r.description,
    kind: r.kind,
    appliesTo: r.applies_to,
    config: r.config,
    priority: r.priority,
    status: r.status,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at)
  };
}

function evalCaseFromRow(r: QueryResultRow): EvalCaseRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    agentId: r.agent_id,
    toolName: r.tool_name,
    args: r.args,
    context: r.context,
    expectedDecision: r.expected_decision,
    expectedReason: r.expected_reason,
    status: r.status,
    createdAt: iso(r.created_at)
  };
}

/** Builds "col = $n" assignments from a map of column -> value (skips undefined). */
function buildSet(values: Record<string, unknown>, params: unknown[]): string[] {
  const sets: string[] = [];
  for (const [col, value] of Object.entries(values)) {
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  }
  return sets;
}

const json = (v: unknown) => (v === undefined ? undefined : JSON.stringify(v));

export const toolRepository = {
  async list(client?: Queryable): Promise<ToolRow[]> {
    const r = await runQuery(
      client,
      `SELECT t.*, c.name AS capability_name FROM harness_tools t
       JOIN ontology_nodes c ON c.id = t.capability_id
       ORDER BY t.name`
    );
    return r.rows.map(toolFromRow);
  },
  async findById(id: string, client?: Queryable): Promise<ToolRow | null> {
    const r = await runQuery(
      client,
      `SELECT t.*, c.name AS capability_name FROM harness_tools t
       JOIN ontology_nodes c ON c.id = t.capability_id WHERE t.id = $1`,
      [id]
    );
    return r.rows[0] ? toolFromRow(r.rows[0]) : null;
  },
  async findByName(name: string, client?: Queryable): Promise<ToolRow | null> {
    const r = await runQuery(client, `SELECT * FROM harness_tools WHERE name = $1`, [name]);
    return r.rows[0] ? toolFromRow(r.rows[0]) : null;
  },
  async create(
    d: { capabilityId: string; name: string; description?: string; riskTier: string; inputSchema: unknown; executor: unknown; status: string },
    client?: Queryable
  ): Promise<ToolRow> {
    const r = await runQuery(
      client,
      `INSERT INTO harness_tools (id, capability_id, name, description, risk_tier, input_schema, executor, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [randomUUID(), d.capabilityId, d.name, d.description ?? null, d.riskTier, json(d.inputSchema), json(d.executor), d.status]
    );
    return toolFromRow(r.rows[0]!);
  },
  async update(
    id: string,
    d: { name?: string; description?: string; riskTier?: string; inputSchema?: unknown; executor?: unknown; status?: string },
    client?: Queryable
  ): Promise<ToolRow | null> {
    const params: unknown[] = [];
    const sets = buildSet(
      {
        name: d.name,
        description: d.description,
        risk_tier: d.riskTier,
        input_schema: json(d.inputSchema),
        executor: json(d.executor),
        status: d.status,
        updated_at: new Date()
      },
      params
    );
    params.push(id);
    const r = await runQuery(client, `UPDATE harness_tools SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    return r.rows[0] ? toolFromRow(r.rows[0]) : null;
  },
  async remove(id: string, client?: Queryable): Promise<boolean> {
    const r = await runQuery(client, `DELETE FROM harness_tools WHERE id = $1`, [id]);
    return (r.rowCount ?? 0) > 0;
  }
};

export const guardrailRepository = {
  async list(client?: Queryable): Promise<GuardrailRow[]> {
    const r = await runQuery(client, `SELECT * FROM harness_guardrails ORDER BY priority DESC, name`);
    return r.rows.map(guardrailFromRow);
  },
  async findById(id: string, client?: Queryable): Promise<GuardrailRow | null> {
    const r = await runQuery(client, `SELECT * FROM harness_guardrails WHERE id = $1`, [id]);
    return r.rows[0] ? guardrailFromRow(r.rows[0]) : null;
  },
  async create(
    d: { name: string; description?: string; policyId?: string; kind: string; appliesTo: unknown; config: unknown; priority: number; status: string },
    client?: Queryable
  ): Promise<GuardrailRow> {
    const r = await runQuery(
      client,
      `INSERT INTO harness_guardrails (id, policy_id, name, description, kind, applies_to, config, priority, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [randomUUID(), d.policyId ?? null, d.name, d.description ?? null, d.kind, json(d.appliesTo), json(d.config), d.priority, d.status]
    );
    return guardrailFromRow(r.rows[0]!);
  },
  async update(
    id: string,
    d: { name?: string; description?: string; policyId?: string | null; appliesTo?: unknown; config?: unknown; priority?: number; status?: string },
    client?: Queryable
  ): Promise<GuardrailRow | null> {
    const params: unknown[] = [];
    const sets = buildSet(
      {
        name: d.name,
        description: d.description,
        policy_id: d.policyId,
        applies_to: json(d.appliesTo),
        config: json(d.config),
        priority: d.priority,
        status: d.status,
        updated_at: new Date()
      },
      params
    );
    params.push(id);
    const r = await runQuery(client, `UPDATE harness_guardrails SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    return r.rows[0] ? guardrailFromRow(r.rows[0]) : null;
  },
  async remove(id: string, client?: Queryable): Promise<boolean> {
    const r = await runQuery(client, `DELETE FROM harness_guardrails WHERE id = $1`, [id]);
    return (r.rowCount ?? 0) > 0;
  }
};

export const evalCaseRepository = {
  async list(client?: Queryable): Promise<EvalCaseRow[]> {
    const r = await runQuery(client, `SELECT * FROM eval_cases ORDER BY name`);
    return r.rows.map(evalCaseFromRow);
  },
  async findById(id: string, client?: Queryable): Promise<EvalCaseRow | null> {
    const r = await runQuery(client, `SELECT * FROM eval_cases WHERE id = $1`, [id]);
    return r.rows[0] ? evalCaseFromRow(r.rows[0]) : null;
  },
  async create(
    d: { name: string; description?: string; agentId?: string; toolName: string; args: unknown; context: unknown; expectedDecision: string; expectedReason?: string; status: string },
    client?: Queryable
  ): Promise<EvalCaseRow> {
    const r = await runQuery(
      client,
      `INSERT INTO eval_cases (id, name, description, agent_id, tool_name, args, context, expected_decision, expected_reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [randomUUID(), d.name, d.description ?? null, d.agentId ?? null, d.toolName, json(d.args), json(d.context), d.expectedDecision, d.expectedReason ?? null, d.status]
    );
    return evalCaseFromRow(r.rows[0]!);
  },
  async update(
    id: string,
    d: { name?: string; description?: string; agentId?: string; toolName?: string; args?: unknown; context?: unknown; expectedDecision?: string; expectedReason?: string; status?: string },
    client?: Queryable
  ): Promise<EvalCaseRow | null> {
    const params: unknown[] = [];
    const sets = buildSet(
      {
        name: d.name,
        description: d.description,
        agent_id: d.agentId,
        tool_name: d.toolName,
        args: json(d.args),
        context: json(d.context),
        expected_decision: d.expectedDecision,
        expected_reason: d.expectedReason,
        status: d.status
      },
      params
    );
    if (sets.length === 0) return this.findById(id, client);
    params.push(id);
    const r = await runQuery(client, `UPDATE eval_cases SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    return r.rows[0] ? evalCaseFromRow(r.rows[0]) : null;
  },
  async remove(id: string, client?: Queryable): Promise<boolean> {
    const r = await runQuery(client, `DELETE FROM eval_cases WHERE id = $1`, [id]);
    return (r.rowCount ?? 0) > 0;
  }
};

export interface CallRecord {
  mode: "LIVE" | "DRY_RUN" | "EVAL";
  sessionId?: string;
  agentId?: string;
  agentName?: string;
  toolName: string;
  args: unknown;
  context: unknown;
  decision: "ALLOW" | "DENY" | "ESCALATE";
  reasons: unknown;
  evaluated: unknown;
  handoffId?: string;
  executed: boolean;
  result?: unknown;
  error?: string;
  durationMs?: number;
  bundleChecksum?: string;
}

export const callRepository = {
  async insert(c: CallRecord, client?: Queryable): Promise<string> {
    const id = randomUUID();
    await runQuery(
      client,
      `INSERT INTO harness_calls (id, mode, session_id, agent_id, agent_name, tool_name, args, context, decision,
         reasons, evaluated, handoff_id, executed, result, error, duration_ms, bundle_checksum)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id, c.mode, c.sessionId ?? null, c.agentId ?? null, c.agentName ?? null, c.toolName,
        json(c.args), json(c.context), c.decision, json(c.reasons), json(c.evaluated),
        c.handoffId ?? null, c.executed, c.result === undefined ? null : json(c.result),
        c.error ?? null, c.durationMs ?? null, c.bundleChecksum ?? null
      ]
    );
    return id;
  },
  async list(opts: { limit: number; offset: number; decision?: string; mode?: string }, client?: Queryable) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (opts.decision) { params.push(opts.decision); where.push(`decision = $${params.length}`); }
    if (opts.mode) { params.push(opts.mode); where.push(`mode = $${params.length}`); }
    params.push(opts.limit, opts.offset);
    const r = await runQuery(
      client,
      `SELECT * FROM harness_calls ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return r.rows.map((x) => ({
      id: x.id, mode: x.mode, sessionId: x.session_id, agentId: x.agent_id, agentName: x.agent_name,
      toolName: x.tool_name, args: x.args, context: x.context, decision: x.decision, reasons: x.reasons,
      evaluated: x.evaluated, handoffId: x.handoff_id, executed: x.executed, result: x.result,
      error: x.error, durationMs: x.duration_ms, bundleChecksum: x.bundle_checksum, createdAt: iso(x.created_at)
    }));
  },
  async summary(client?: Queryable) {
    const r = await runQuery<{ decision: string; c: string }>(
      client,
      `SELECT decision, count(*) AS c FROM harness_calls WHERE mode <> 'EVAL' GROUP BY decision`
    );
    const out: Record<string, number> = { ALLOW: 0, DENY: 0, ESCALATE: 0 };
    for (const row of r.rows) out[row.decision] = Number(row.c);
    return out;
  }
};

export const bundleRepository = {
  async insert(checksum: string, content: unknown, client?: Queryable) {
    const id = randomUUID();
    const r = await runQuery(
      client,
      `INSERT INTO harness_bundles (id, checksum, content) VALUES ($1,$2,$3) RETURNING id, checksum, created_at`,
      [id, checksum, json(content)]
    );
    return { id: r.rows[0]!.id as string, checksum: r.rows[0]!.checksum as string, createdAt: iso(r.rows[0]!.created_at) };
  },
  async list(client?: Queryable) {
    const r = await runQuery(client, `SELECT id, checksum, created_at FROM harness_bundles ORDER BY created_at DESC LIMIT 50`);
    return r.rows.map((x) => ({ id: x.id as string, checksum: x.checksum as string, createdAt: iso(x.created_at) }));
  },
  async latest(client?: Queryable) {
    const r = await runQuery(client, `SELECT id, checksum, content, created_at FROM harness_bundles ORDER BY created_at DESC LIMIT 1`);
    const x = r.rows[0];
    return x ? { id: x.id as string, checksum: x.checksum as string, content: x.content, createdAt: iso(x.created_at) } : null;
  },
  async findById(id: string, client?: Queryable) {
    const r = await runQuery(client, `SELECT id, checksum, content, created_at FROM harness_bundles WHERE id = $1`, [id]);
    const x = r.rows[0];
    return x ? { id: x.id as string, checksum: x.checksum as string, content: x.content, createdAt: iso(x.created_at) } : null;
  }
};

export const evalRunRepository = {
  async insert(run: { total: number; passed: number; failed: number; results: unknown }, client?: Queryable) {
    const id = randomUUID();
    const r = await runQuery(
      client,
      `INSERT INTO eval_runs (id, total, passed, failed, results) VALUES ($1,$2,$3,$4,$5) RETURNING created_at`,
      [id, run.total, run.passed, run.failed, json(run.results)]
    );
    return { id, ...run, createdAt: iso(r.rows[0]!.created_at) };
  },
  async list(client?: Queryable) {
    const r = await runQuery(client, `SELECT * FROM eval_runs ORDER BY created_at DESC LIMIT 30`);
    return r.rows.map((x) => ({
      id: x.id as string, total: x.total as number, passed: x.passed as number, failed: x.failed as number,
      results: x.results as unknown[], createdAt: iso(x.created_at)
    }));
  }
};

export const apiKeyRepository = {
  async list(businessId: string, client?: Queryable) {
    const r = await runQuery(
      client,
      `SELECT id, name, prefix, created_at, revoked_at FROM harness_api_keys WHERE business_id = $1 ORDER BY created_at DESC`,
      [businessId]
    );
    return r.rows.map((x) => ({
      id: x.id as string, name: x.name as string, prefix: x.prefix as string,
      createdAt: iso(x.created_at), revokedAt: x.revoked_at ? iso(x.revoked_at) : null
    }));
  },
  async create(businessId: string, name: string, prefix: string, keyHash: string, client?: Queryable) {
    const id = randomUUID();
    await runQuery(
      client,
      `INSERT INTO harness_api_keys (id, business_id, name, prefix, key_hash) VALUES ($1,$2,$3,$4,$5)`,
      [id, businessId, name, prefix, keyHash]
    );
    return id;
  },
  async revoke(businessId: string, id: string, client?: Queryable) {
    const r = await runQuery(
      client,
      `UPDATE harness_api_keys SET revoked_at = now() WHERE id = $1 AND business_id = $2 AND revoked_at IS NULL`,
      [id, businessId]
    );
    return (r.rowCount ?? 0) > 0;
  }
};

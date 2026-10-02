-- Agent harness, per business: tool contracts, enforceable guardrails, the
-- append-only call audit, compiled ontology bundles, evaluation cases and runs.
-- Same isolation model as 003: business_id + Row-Level Security.

-- Control-plane table (no RLS): the gateway has to resolve an API key to its
-- business BEFORE any business context exists. Only a SHA-256 hash is stored.
CREATE TABLE IF NOT EXISTS harness_api_keys (
  id          UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  prefix      TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS harness_api_keys_business_idx ON harness_api_keys(business_id);

-- Contract of a tool an agent may call. Bound to a Capability node, which is
-- what Agents are granted through a HAS_CAPABILITY relationship.
CREATE TABLE IF NOT EXISTS harness_tools (
  id            UUID PRIMARY KEY,
  business_id   UUID NOT NULL DEFAULT current_business_id() REFERENCES businesses(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  risk_tier     TEXT NOT NULL DEFAULT 'LOW' CHECK (risk_tier IN ('LOW','MEDIUM','HIGH')),
  input_schema  JSONB NOT NULL DEFAULT '{"type":"object","properties":{}}'::jsonb,
  executor      JSONB NOT NULL DEFAULT '{"type":"none"}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, name),
  FOREIGN KEY (capability_id, business_id) REFERENCES ontology_nodes(id, business_id) ON DELETE CASCADE
);

-- Machine-enforceable guardrails. A Policy node stays the human-readable
-- statement; a guardrail is what the gateway actually evaluates.
CREATE TABLE IF NOT EXISTS harness_guardrails (
  id          UUID PRIMARY KEY,
  business_id UUID NOT NULL DEFAULT current_business_id() REFERENCES businesses(id) ON DELETE CASCADE,
  policy_id   UUID,
  name        TEXT NOT NULL,
  description TEXT,
  kind        TEXT NOT NULL CHECK (kind IN ('DENY','REQUIRE_VERIFICATION','LIMIT','REQUIRE_APPROVAL')),
  applies_to  JSONB NOT NULL DEFAULT '{}'::jsonb,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, name),
  FOREIGN KEY (policy_id, business_id) REFERENCES ontology_nodes(id, business_id) ON DELETE SET NULL (policy_id)
);

-- Append-only audit of every gateway decision (the app role gets no UPDATE/DELETE).
CREATE TABLE IF NOT EXISTS harness_calls (
  id              UUID PRIMARY KEY,
  business_id     UUID NOT NULL DEFAULT current_business_id() REFERENCES businesses(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('LIVE','DRY_RUN','EVAL')),
  session_id      TEXT,
  agent_id        UUID,
  agent_name      TEXT,
  tool_name       TEXT NOT NULL,
  args            JSONB NOT NULL DEFAULT '{}'::jsonb,
  context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision        TEXT NOT NULL CHECK (decision IN ('ALLOW','DENY','ESCALATE')),
  reasons         JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluated       JSONB NOT NULL DEFAULT '[]'::jsonb,
  handoff_id      UUID,
  executed        BOOLEAN NOT NULL DEFAULT false,
  result          JSONB,
  error           TEXT,
  duration_ms     INTEGER,
  bundle_checksum TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS harness_calls_business_idx ON harness_calls(business_id, created_at DESC);

-- A compiled, immutable snapshot of the ontology as the agent runtime loads it.
CREATE TABLE IF NOT EXISTS harness_bundles (
  id          UUID PRIMARY KEY,
  business_id UUID NOT NULL DEFAULT current_business_id() REFERENCES businesses(id) ON DELETE CASCADE,
  checksum    TEXT NOT NULL,
  content     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS harness_bundles_business_idx ON harness_bundles(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS eval_cases (
  id                UUID PRIMARY KEY,
  business_id       UUID NOT NULL DEFAULT current_business_id() REFERENCES businesses(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  agent_id          UUID,
  tool_name         TEXT NOT NULL,
  args              JSONB NOT NULL DEFAULT '{}'::jsonb,
  context           JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_decision TEXT NOT NULL CHECK (expected_decision IN ('ALLOW','DENY','ESCALATE')),
  expected_reason   TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, name),
  FOREIGN KEY (agent_id, business_id) REFERENCES ontology_nodes(id, business_id) ON DELETE SET NULL (agent_id)
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id          UUID PRIMARY KEY,
  business_id UUID NOT NULL DEFAULT current_business_id() REFERENCES businesses(id) ON DELETE CASCADE,
  total       INTEGER NOT NULL,
  passed      INTEGER NOT NULL,
  failed      INTEGER NOT NULL,
  results     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eval_runs_business_idx ON eval_runs(business_id, created_at DESC);

ALTER TABLE harness_tools      ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_tools      FORCE ROW LEVEL SECURITY;
ALTER TABLE harness_guardrails ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_guardrails FORCE ROW LEVEL SECURITY;
ALTER TABLE harness_calls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_calls      FORCE ROW LEVEL SECURITY;
ALTER TABLE harness_bundles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_bundles    FORCE ROW LEVEL SECURITY;
ALTER TABLE eval_cases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_cases         FORCE ROW LEVEL SECURITY;
ALTER TABLE eval_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_runs          FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_isolation ON harness_tools;
CREATE POLICY business_isolation ON harness_tools
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
DROP POLICY IF EXISTS business_isolation ON harness_guardrails;
CREATE POLICY business_isolation ON harness_guardrails
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
DROP POLICY IF EXISTS business_isolation ON harness_calls;
CREATE POLICY business_isolation ON harness_calls
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
DROP POLICY IF EXISTS business_isolation ON harness_bundles;
CREATE POLICY business_isolation ON harness_bundles
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
DROP POLICY IF EXISTS business_isolation ON eval_cases;
CREATE POLICY business_isolation ON eval_cases
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
DROP POLICY IF EXISTS business_isolation ON eval_runs;
CREATE POLICY business_isolation ON eval_runs
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ontology_app;
REVOKE UPDATE, DELETE ON harness_calls FROM ontology_app;
REVOKE UPDATE, DELETE ON harness_bundles FROM ontology_app;

-- =====================================================================
-- Ontology Builder — estrutura COMPLETA do banco (PostgreSQL 14+)
-- Gerado por: npm run db:full-sql  (não edite à mão; edite postgres/migrations/)
--
-- COMO USAR NO DBEAVER
--   1. Crie o banco (uma vez):   CREATE DATABASE ontology;
--      (clique direito em Databases > Create New Database, ou rode o comando)
--   2. Conecte-se NO banco "ontology" com um usuário que possa criar roles
--      (o usuário "ontology" do docker-compose ou "postgres").
--   3. Abra este arquivo e rode como SCRIPT inteiro: Alt+X
--      (menu SQL Editor > Execute SQL Script) — NÃO use Ctrl+Enter.
--   4. Rode as consultas de verificação no final.
--
-- Pode ser executado quantas vezes quiser: tudo é idempotente (IF NOT EXISTS).
-- Se já existir um banco antigo de um único negócio, os dados dele vão para o
-- negócio "default".
--
-- Conteúdo: 001_tables.sql, 002_indexes.sql, 003_businesses.sql, 004_harness.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 001_tables.sql
-- ---------------------------------------------------------------------
-- Core tables for the ontology graph model. IF NOT EXISTS keeps this
-- idempotent so it can safely run on every API boot.

CREATE TABLE IF NOT EXISTS ontology_nodes (
  id          UUID PRIMARY KEY,
  label       TEXT NOT NULL CHECK (label IN (
                'Entity','Concept','RelationshipDefinition','Rule','State',
                'Capability','Agent','Policy','Issue','Handoff','Decision',
                'Execution','LearningEvent'
              )),
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'DRAFT',
  domain      TEXT,
  version     TEXT NOT NULL DEFAULT '0.1.0',
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Real graph edges: the RelationshipDefinition mirror edge and the
-- FROM_AGENT/TO_AGENT edges created alongside a Handoff. CONTAINS
-- (version membership) is NOT an edge here — see version_contents.
CREATE TABLE IF NOT EXISTS ontology_edges (
  id                          UUID PRIMARY KEY,
  source_id                   UUID NOT NULL REFERENCES ontology_nodes(id) ON DELETE CASCADE,
  target_id                   UUID NOT NULL REFERENCES ontology_nodes(id) ON DELETE CASCADE,
  type                        TEXT NOT NULL,
  relationship_definition_id  UUID REFERENCES ontology_nodes(id) ON DELETE CASCADE,
  cardinality                 TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ontology_versions (
  id          UUID PRIMARY KEY,
  version     TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by  TEXT,
  status      TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Version membership (replaces the CONTAINS edge).
CREATE TABLE IF NOT EXISTS version_contents (
  version_id  UUID NOT NULL REFERENCES ontology_versions(id) ON DELETE CASCADE,
  node_id     UUID NOT NULL REFERENCES ontology_nodes(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, node_id)
);

-- Singleton row holding the graph view's saved node positions.
CREATE TABLE IF NOT EXISTS graph_layout (
  id         TEXT PRIMARY KEY DEFAULT 'singleton',
  positions  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  result        TEXT NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 002_indexes.sql
-- ---------------------------------------------------------------------
-- Indexes on the fields every list endpoint actually filters/searches by:
-- name (search), status and domain (every resource's list query accepts a
-- status filter, graph queries also filter by domain).
CREATE INDEX IF NOT EXISTS ontology_nodes_label_name_idx   ON ontology_nodes(label, name);
CREATE INDEX IF NOT EXISTS ontology_nodes_label_status_idx ON ontology_nodes(label, status);
CREATE INDEX IF NOT EXISTS ontology_nodes_label_domain_idx ON ontology_nodes(label, domain);

CREATE INDEX IF NOT EXISTS ontology_edges_source_idx ON ontology_edges(source_id);
CREATE INDEX IF NOT EXISTS ontology_edges_target_idx ON ontology_edges(target_id);
CREATE INDEX IF NOT EXISTS ontology_edges_type_idx   ON ontology_edges(type);

-- One mirror edge per RelationshipDefinition (equivalent to the Cypher
-- MERGE keyed on relationshipDefinitionId).
CREATE UNIQUE INDEX IF NOT EXISTS ontology_edges_reldef_unique
  ON ontology_edges(relationship_definition_id) WHERE relationship_definition_id IS NOT NULL;

-- FROM_AGENT/TO_AGENT edges: natural key, no relationship_definition_id.
CREATE UNIQUE INDEX IF NOT EXISTS ontology_edges_natural_unique
  ON ontology_edges(source_id, target_id, type) WHERE relationship_definition_id IS NULL;

CREATE INDEX IF NOT EXISTS version_contents_node_idx ON version_contents(node_id);

CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log(resource_type, resource_id);

-- ---------------------------------------------------------------------
-- 003_businesses.sql
-- ---------------------------------------------------------------------
-- Multi-business (multi-tenant) segmentation.
-- Every ontology row hangs off exactly one business. Isolation is enforced by
-- PostgreSQL Row-Level Security, not by application code: the API runs every
-- statement as the non-privileged role ontology_app with
-- app.business_id set for the current transaction. No business set = no rows
-- visible and no row insertable (fail closed).
-- Fully idempotent: safe to run on every API boot, and it upgrades an existing
-- single-business database by moving all legacy rows into the "default" business.

CREATE TABLE IF NOT EXISTS businesses (
  id          UUID PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO businesses (id, slug, name, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Negócio padrão',
        'Criado na migração para receber a ontologia que existia antes da segmentação por negócio.')
ON CONFLICT (id) DO NOTHING;

-- Unprivileged role every API statement runs as (via SET LOCAL ROLE). RLS
-- applies to it even when the connection user is a superuser (the docker
-- image's POSTGRES_USER is one, and superusers bypass RLS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ontology_app') THEN
    CREATE ROLE ontology_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT ontology_app TO %I', current_user);
END
$$;

CREATE OR REPLACE FUNCTION current_business_id() RETURNS uuid
LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.business_id', true), '')::uuid $$;

-- business_id on every tenant table: add, backfill, default from session, NOT NULL.
ALTER TABLE ontology_nodes    ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE ontology_edges    ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE ontology_versions ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE version_contents  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE graph_layout      ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE audit_log         ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

UPDATE ontology_nodes    SET business_id = '00000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
UPDATE ontology_edges    SET business_id = '00000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
UPDATE ontology_versions SET business_id = '00000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
UPDATE version_contents  SET business_id = '00000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
UPDATE graph_layout      SET business_id = '00000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
UPDATE audit_log         SET business_id = '00000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;

ALTER TABLE ontology_nodes    ALTER COLUMN business_id SET DEFAULT current_business_id();
ALTER TABLE ontology_edges    ALTER COLUMN business_id SET DEFAULT current_business_id();
ALTER TABLE ontology_versions ALTER COLUMN business_id SET DEFAULT current_business_id();
ALTER TABLE version_contents  ALTER COLUMN business_id SET DEFAULT current_business_id();
ALTER TABLE graph_layout      ALTER COLUMN business_id SET DEFAULT current_business_id();
ALTER TABLE audit_log         ALTER COLUMN business_id SET DEFAULT current_business_id();

ALTER TABLE ontology_nodes    ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE ontology_edges    ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE ontology_versions ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE version_contents  ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE graph_layout      ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE audit_log         ALTER COLUMN business_id SET NOT NULL;

-- Composite keys so foreign keys cannot cross businesses (an FK check bypasses
-- RLS, so without these a row could point at another business's node).
CREATE UNIQUE INDEX IF NOT EXISTS ontology_nodes_id_business_uq    ON ontology_nodes(id, business_id);
CREATE UNIQUE INDEX IF NOT EXISTS ontology_versions_id_business_uq ON ontology_versions(id, business_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ontology_edges_source_biz_fk') THEN
    ALTER TABLE ontology_edges DROP CONSTRAINT IF EXISTS ontology_edges_source_id_fkey;
    ALTER TABLE ontology_edges ADD CONSTRAINT ontology_edges_source_biz_fk
      FOREIGN KEY (source_id, business_id) REFERENCES ontology_nodes(id, business_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ontology_edges_target_biz_fk') THEN
    ALTER TABLE ontology_edges DROP CONSTRAINT IF EXISTS ontology_edges_target_id_fkey;
    ALTER TABLE ontology_edges ADD CONSTRAINT ontology_edges_target_biz_fk
      FOREIGN KEY (target_id, business_id) REFERENCES ontology_nodes(id, business_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ontology_edges_reldef_biz_fk') THEN
    ALTER TABLE ontology_edges DROP CONSTRAINT IF EXISTS ontology_edges_relationship_definition_id_fkey;
    ALTER TABLE ontology_edges ADD CONSTRAINT ontology_edges_reldef_biz_fk
      FOREIGN KEY (relationship_definition_id, business_id) REFERENCES ontology_nodes(id, business_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'version_contents_version_biz_fk') THEN
    ALTER TABLE version_contents DROP CONSTRAINT IF EXISTS version_contents_version_id_fkey;
    ALTER TABLE version_contents ADD CONSTRAINT version_contents_version_biz_fk
      FOREIGN KEY (version_id, business_id) REFERENCES ontology_versions(id, business_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'version_contents_node_biz_fk') THEN
    ALTER TABLE version_contents DROP CONSTRAINT IF EXISTS version_contents_node_id_fkey;
    ALTER TABLE version_contents ADD CONSTRAINT version_contents_node_biz_fk
      FOREIGN KEY (node_id, business_id) REFERENCES ontology_nodes(id, business_id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Version numbers are unique per business, not globally.
ALTER TABLE ontology_versions DROP CONSTRAINT IF EXISTS ontology_versions_version_key;
CREATE UNIQUE INDEX IF NOT EXISTS ontology_versions_business_version_uq ON ontology_versions(business_id, version);

-- One saved graph layout per business (was a global 'singleton' row).
CREATE UNIQUE INDEX IF NOT EXISTS graph_layout_business_uq ON graph_layout(business_id);
ALTER TABLE graph_layout DROP CONSTRAINT IF EXISTS graph_layout_pkey;

CREATE INDEX IF NOT EXISTS ontology_nodes_business_label_idx ON ontology_nodes(business_id, label, status);
CREATE INDEX IF NOT EXISTS ontology_edges_business_idx       ON ontology_edges(business_id);
CREATE INDEX IF NOT EXISTS audit_log_business_idx            ON audit_log(business_id, timestamp DESC);

-- Row-Level Security: a row is visible/writable only inside its own business.
ALTER TABLE ontology_nodes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontology_nodes    FORCE ROW LEVEL SECURITY;
ALTER TABLE ontology_edges    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontology_edges    FORCE ROW LEVEL SECURITY;
ALTER TABLE ontology_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontology_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE version_contents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE version_contents  FORCE ROW LEVEL SECURITY;
ALTER TABLE graph_layout      ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_layout      FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log         FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_isolation ON ontology_nodes;
CREATE POLICY business_isolation ON ontology_nodes
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
DROP POLICY IF EXISTS business_isolation ON ontology_edges;
CREATE POLICY business_isolation ON ontology_edges
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
DROP POLICY IF EXISTS business_isolation ON ontology_versions;
CREATE POLICY business_isolation ON ontology_versions
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
DROP POLICY IF EXISTS business_isolation ON version_contents;
CREATE POLICY business_isolation ON version_contents
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
DROP POLICY IF EXISTS business_isolation ON graph_layout;
CREATE POLICY business_isolation ON graph_layout
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
DROP POLICY IF EXISTS business_isolation ON audit_log;
CREATE POLICY business_isolation ON audit_log
  USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());

GRANT USAGE ON SCHEMA public TO ontology_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ontology_app;
GRANT EXECUTE ON FUNCTION current_business_id() TO ontology_app;

-- ---------------------------------------------------------------------
-- 004_harness.sql
-- ---------------------------------------------------------------------
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

COMMIT;

-- =====================================================================
-- VERIFICAÇÃO (rode depois, uma consulta por vez com Ctrl+Enter)
-- =====================================================================

-- 1) Tabelas criadas
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public' ORDER BY table_name;

-- 2) RLS ativo em todas as tabelas de negócio (relrowsecurity e relforcerowsecurity = true)
-- SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--  WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND relrowsecurity ORDER BY relname;

-- 3) Negócio inicial
-- SELECT id, slug, name, status FROM businesses;

-- =====================================================================
-- DICAS DE USO NO DBEAVER
-- =====================================================================
-- * Seu usuário (superuser) enxerga TODOS os negócios: o RLS só vale para o papel
--   "ontology_app", que é o que a API usa. Para ver um negócio como a API vê:
--     BEGIN;
--     SET LOCAL ROLE ontology_app;
--     SELECT set_config('app.business_id', '<id do negocio>', true);
--     SELECT * FROM ontology_nodes;   -- só as linhas desse negócio
--     ROLLBACK;
--
-- * Criar um negócio à mão:
--     INSERT INTO businesses (id, slug, name)
--     VALUES (gen_random_uuid(), 'minha-empresa', 'Minha Empresa');
--
-- * Toda tabela de dados tem business_id. Ao inserir direto como superuser,
--   informe-o (ou rode antes: SELECT set_config('app.business_id','<id>',false);).

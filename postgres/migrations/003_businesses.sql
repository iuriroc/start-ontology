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

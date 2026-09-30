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

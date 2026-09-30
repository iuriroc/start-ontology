-- Optional example data matching the acceptance scenario in the spec
-- (section 56/59): Seller -[:OWNS]-> Customer -[:PERFORMED]-> Transaction.
-- Not run automatically — the app never seeds business data on its own.
-- Load manually if you want a starting point:
--
--   psql "$DATABASE_URL" -f postgres/seed/example-scenario.sql
--
-- Requires postgres/migrations to have run first (tables/indexes).
--
-- Note: this creates the raw graph edges only, not the matching
-- RelationshipDefinition rows the API creates alongside them (so
-- relationship_definition_id is left NULL, using the edges' natural-key
-- uniqueness instead) — these edges show up in the Graph View but not in
-- the Relationships list/CRUD page. Prefer creating data through the app
-- or the API so both stay in sync; this file is a quick way to see
-- something in the Graph View only.

INSERT INTO ontology_nodes (id, label, name, domain, status, version, data)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Entity', 'Seller', 'commerce', 'ACTIVE', '0.1.0',
    '{"properties": []}'::jsonb),
  ('00000000-0000-4000-8000-000000000002', 'Entity', 'Customer', 'commerce', 'ACTIVE', '0.1.0',
    '{"properties": [{"name":"email","type":"STRING","required":true}]}'::jsonb),
  ('00000000-0000-4000-8000-000000000003', 'Entity', 'Transaction', 'commerce', 'ACTIVE', '0.1.0',
    '{"properties": []}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, domain = EXCLUDED.domain, status = EXCLUDED.status,
  version = EXCLUDED.version, data = EXCLUDED.data, updated_at = now();

INSERT INTO ontology_edges (id, source_id, target_id, type)
VALUES
  ('00000000-0000-4000-8000-0000000000b1',
    '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'OWNS'),
  ('00000000-0000-4000-8000-0000000000b2',
    '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'PERFORMED')
ON CONFLICT (source_id, target_id, type) WHERE relationship_definition_id IS NULL DO NOTHING;

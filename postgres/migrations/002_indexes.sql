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

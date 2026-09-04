// Unique id constraint per ontology label. IF NOT EXISTS keeps this idempotent
// so it can safely run on every API boot.
CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (n:Entity) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT concept_id_unique IF NOT EXISTS FOR (n:Concept) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT relationshipdefinition_id_unique IF NOT EXISTS FOR (n:RelationshipDefinition) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT rule_id_unique IF NOT EXISTS FOR (n:Rule) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT state_id_unique IF NOT EXISTS FOR (n:State) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT capability_id_unique IF NOT EXISTS FOR (n:Capability) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT agent_id_unique IF NOT EXISTS FOR (n:Agent) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT policy_id_unique IF NOT EXISTS FOR (n:Policy) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT issue_id_unique IF NOT EXISTS FOR (n:Issue) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT handoff_id_unique IF NOT EXISTS FOR (n:Handoff) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT decision_id_unique IF NOT EXISTS FOR (n:Decision) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT execution_id_unique IF NOT EXISTS FOR (n:Execution) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT learningevent_id_unique IF NOT EXISTS FOR (n:LearningEvent) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT ontologyversion_id_unique IF NOT EXISTS FOR (n:OntologyVersion) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT ontologyversion_version_unique IF NOT EXISTS FOR (n:OntologyVersion) REQUIRE n.version IS UNIQUE;

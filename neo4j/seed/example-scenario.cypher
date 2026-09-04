// Optional example data matching the acceptance scenario in the spec
// (section 56/59): Seller -[:OWNS]-> Customer -[:PERFORMED]-> Transaction,
// plus a Concept/Rule/State/Capability/Agent/Policy. Not run automatically —
// the app never seeds business data on its own. Load manually if you want a
// starting point:
//
//   cypher-shell -a bolt://localhost:7687 -u neo4j -p <password> -f neo4j/seed/example-scenario.cypher
//
// Requires neo4j/migrations to have run first (constraints/indexes).
//
// Note: this creates the raw graph edges only, not the matching
// :RelationshipDefinition records the API creates alongside them — so these
// edges show up in the Graph View but not in the Relationships list/CRUD
// page. Prefer creating data through the app or the API so both stay in
// sync; this file is a quick way to see something in the Graph View only.

MERGE (seller:Entity {id: "00000000-0000-4000-8000-000000000001"})
SET seller.name = "Seller", seller.domain = "commerce", seller.status = "ACTIVE",
    seller.version = "0.1.0", seller.properties = "[]",
    seller.createdAt = datetime().epochMillis, seller.updatedAt = datetime().epochMillis;

MERGE (customer:Entity {id: "00000000-0000-4000-8000-000000000002"})
SET customer.name = "Customer", customer.domain = "commerce", customer.status = "ACTIVE",
    customer.version = "0.1.0", customer.properties = '[{"name":"email","type":"STRING","required":true}]',
    customer.createdAt = datetime().epochMillis, customer.updatedAt = datetime().epochMillis;

MERGE (transaction:Entity {id: "00000000-0000-4000-8000-000000000003"})
SET transaction.name = "Transaction", transaction.domain = "commerce", transaction.status = "ACTIVE",
    transaction.version = "0.1.0", transaction.properties = "[]",
    transaction.createdAt = datetime().epochMillis, transaction.updatedAt = datetime().epochMillis;

MATCH (seller:Entity {id: "00000000-0000-4000-8000-000000000001"}),
      (customer:Entity {id: "00000000-0000-4000-8000-000000000002"})
MERGE (seller)-[:OWNS {relationshipDefinitionId: "00000000-0000-4000-8000-0000000000a1"}]->(customer);

MATCH (customer:Entity {id: "00000000-0000-4000-8000-000000000002"}),
      (transaction:Entity {id: "00000000-0000-4000-8000-000000000003"})
MERGE (customer)-[:PERFORMED {relationshipDefinitionId: "00000000-0000-4000-8000-0000000000a2"}]->(transaction);

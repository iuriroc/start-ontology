# Ontology Builder

A visual tool for building, editing, versioning, backing up, restoring and transferring an
enterprise ontology directly into a Neo4j graph database. **Neo4j is the source of truth.**
This project builds and administers that graph — it does not consume it. A separate,
independent application ("Paperclip") will later read the ontology this tool produces.

## 1. Objective

Model an ontology — Entities, Concepts, Relationships, Rules, States, Capabilities, Agents,
Policies, Issues, Handoffs, Decisions, Executions, Learning Events, and versioned snapshots of
all of the above — without writing Cypher by hand.

## 2. Architecture

```
Browser (React + Vite + React Flow)
        │  HTTP/REST only
        ▼
Ontology API (Node.js + Fastify + Zod)
        │  neo4j-driver, parameterized Cypher only
        ▼
Neo4j (source of truth)
```

- The **frontend never talks to Neo4j directly** and never holds Neo4j credentials.
- The **API is the only thing that can reach Neo4j**, and every write goes through Zod
  validation first.
- Relationship types and Neo4j labels are never taken from raw user strings without going
  through an allowlist/normalization step (`packages/shared/src/schemas/labels.ts`) — Cypher
  cannot parameterize labels or relationship types, so this is the layer that keeps that safe.

## 3. Requirements

- Node.js 20+
- Docker + Docker Compose (for Neo4j, and optionally for running the whole stack)

## 4. Installation

```bash
npm install
cp .env.example .env
```

## 5. Configuration

Edit `.env`:

| Variable | Purpose |
| --- | --- |
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | Neo4j connection — API-side only, never sent to the browser |
| `API_PORT` | Fastify port (default 3001) |
| `CORS_ORIGIN` | Allowed origin(s) for the web app |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | API rate limiting |
| `BODY_LIMIT_BYTES` | Max JSON request body size |
| `BACKUP_DIR` | Where `.zip` backups are written on the API host |
| `VITE_API_URL` | The only Neo4j-adjacent config the frontend gets — an HTTP URL, never credentials |

## 6. Docker

```bash
docker compose up -d
```

Brings up Neo4j (ports 7474/7687, persistent `neo4j_data`/`neo4j_logs` volumes), the API
(3001) and the web app (5173, served by nginx). Or run just the database and develop the
apps locally:

```bash
docker compose up -d neo4j
```

## 7. Neo4j

Constraints and indexes live in `neo4j/migrations/*.cypher` (unique `id` per label, plus
`name`/`status` indexes on the fields every list endpoint actually filters by). The API runs
every migration file — in filename order, all `IF NOT EXISTS` — on boot, so it's safe on every
restart. An optional, manually-run example dataset lives in `neo4j/seed/example-scenario.cypher`.

## 8. Backend (`apps/api`)

```bash
npm run dev:api      # tsx watch, http://localhost:3001
npm run build --workspace=apps/api
npm run typecheck --workspace=apps/api
```

Layout: `config` (env parsing) → `neo4j` (driver + migrations) → `repositories` (Cypher) →
`services` (business rules, audit, validation) → `routes` (Fastify handlers) → `schemas` come
from `packages/shared` so the API and the web app validate against the exact same Zod shapes.

Every simple CRUD resource (Entities, Concepts, Rules, States, Capabilities, Agents, Policies,
Issues, Decisions, Executions, Learning Events) shares one generic repository/service/route
factory (`repositories/nodeRepository.ts`, `services/ontologyService.ts`, `routes/crudRoutes.ts`)
parameterized by a fixed Neo4j label. Relationships, Handoffs and OntologyVersion get dedicated
repositories because they also create real graph edges or have their own lifecycle.

## 9. Frontend (`apps/web`)

```bash
npm run dev:web       # http://localhost:5173
```

Sidebar navigation mirrors spec section 29: Dashboard, the ontology resource list, Graph View
(React Flow), Versions, Backup & Restore. Node position on the graph canvas is stored
separately from element properties (`GET/PUT /api/ontology/graph/layout`) so dragging a node
never changes its semantic data.

## 10. Development

```bash
npm run dev           # api + web together
```

## 11. Tests

```bash
npm test              # apps/api (vitest) + apps/web (vitest)
```

Schema/validator tests (`relationshipType.test.ts`, `schemas.test.ts`) and the full
`restoreValidation.test.ts` suite (malformed zip, missing manifest, checksum tampering, schema
failures, expired import id, unconfirmed replace) need no database — they exercise the restore
pipeline up to, but not including, the Neo4j write. `health.test.ts` and
`ontology.integration.test.ts` use Fastify's `.inject()` — the Fastify-native equivalent of
Supertest, no real socket needed. The integration test walks the full spec section 56 scenario
(Seller/Customer/Transaction, relationships, a concept, a rule, a state, a capability, an agent,
a policy, a version, backup, the real multipart restore flow, and validation) and is skipped
automatically if Neo4j isn't reachable — start it first:

```bash
docker compose up -d neo4j
npm test
```

## 12. Backup

`POST /api/backup` (saved server-side under `BACKUP_DIR`) and `GET /api/export` (streamed
download) both produce a zip containing:

- `ontology.json` — the full structured snapshot (every element of every label, plus version
  membership)
- `ontology.cypher` — a deterministic, idempotent (`MERGE` + `IF NOT EXISTS`) script that
  reconstructs the same graph from scratch via `cypher-shell`, independent of this app
- `manifest.json` — `{ format, formatVersion, ontologyVersion, createdAt, nodeCount,
  relationshipCount, checksum }`, where `checksum` is the SHA-256 of `ontology.json`

## 13. Restore

Restoring is two calls, deliberately:

1. `POST /api/import` (multipart `file`) runs the full validation pipeline — archive
   structure → manifest shape → checksum → `ontology.json` schema → duplicate ids → broken
   relationship/handoff references → broken version references — and stages the result
   in-memory for 10 minutes, returning an `importId` and a count summary. Nothing touches
   Neo4j at this point.
2. `POST /api/restore` with `{ importId, mode: "merge" | "replace", confirmReplace }` commits
   it. `merge` upserts by id and leaves everything else alone; `replace` first deletes every
   ontology-labeled node and requires `confirmReplace: true`. Published `OntologyVersion`
   nodes are never deleted by any code path in this app.

## 14. Migration / transfer

`Neo4j A → GET /api/export → zip → POST /api/import + POST /api/restore on Server B's API →
Neo4j B`. The zip is self-contained; nothing in it depends on the originating server.

## 15. Ontology structure

See `packages/shared/src/schemas/*.ts` for the authoritative Zod shape of every element.
Every element has at minimum `id` (UUID), `name`, `description`, `status`
(`DRAFT`/`ACTIVE`/`ARCHIVED`), `version`, `createdAt`, `updatedAt`. `OntologyVersion` has its
own lifecycle (`DRAFT` → `PUBLISHED` → `ARCHIVED`) instead. Neo4j labels are explicit per type
(`:Entity`, `:Concept`, `:RelationshipDefinition`, `:Rule`, `:State`, `:Capability`, `:Agent`,
`:Policy`, `:Issue`, `:Handoff`, `:Decision`, `:Execution`, `:LearningEvent`,
`:OntologyVersion`) — never one generic node label for everything.

A `Relationship` is stored as both a `:RelationshipDefinition` node (so it gets the same
CRUD/versioning treatment as every other element) and a real typed edge between the referenced
source/target nodes, so the graph view shows an actual `(Customer)-[:PERFORMED]->(Transaction)`.

## 16. API

All routes are under `/api`. See `apps/api/src/routes/*.ts`. Summary:

```
GET    /api/health

GET|POST /api/entities            GET|PUT|DELETE /api/entities/:id
GET|POST /api/concepts            GET|PUT|DELETE /api/concepts/:id
GET|POST /api/relationships       GET|PUT|DELETE /api/relationships/:id
GET|POST /api/rules               GET|PUT|DELETE /api/rules/:id
GET|POST /api/states              GET|PUT|DELETE /api/states/:id
GET|POST /api/capabilities        GET|PUT|DELETE /api/capabilities/:id
GET|POST /api/agents              GET|PUT|DELETE /api/agents/:id
GET|POST /api/policies            GET|PUT|DELETE /api/policies/:id
GET|POST /api/issues              GET|PUT|DELETE /api/issues/:id
GET|POST /api/handoffs            GET|PUT|DELETE /api/handoffs/:id
GET|POST /api/decisions           GET|PUT|DELETE /api/decisions/:id
GET|POST /api/executions          GET|PUT|DELETE /api/executions/:id
GET|POST /api/learning-events     GET|PUT|DELETE /api/learning-events/:id

GET    /api/ontology                       # dashboard counts + current version
GET    /api/ontology/graph                 # React Flow nodes/edges
GET|PUT /api/ontology/graph/layout         # saved node positions only
GET    /api/ontology/validate              # structural validator (section 43)

GET|POST /api/versions
GET      /api/versions/:id
GET|POST /api/versions/:id/contents        # attach an element (DRAFT only)
POST     /api/versions/:id/publish
POST     /api/versions/:id/archive
DELETE   /api/versions/:id                 # DRAFT only — published/archived versions are never deletable

POST   /api/backup
GET    /api/export
POST   /api/import       # multipart zip -> validate -> { importId, counts }
POST   /api/restore      # { importId, mode, confirmReplace } -> commit
```

`DELETE` on any CRUD resource soft-deletes (`status: ARCHIVED`) by default; pass `?hard=true`
for a real delete. Either one is rejected with `409 ELEMENT_HAS_RELATIONSHIPS` if the element
has relationships, unless `?force=true` is also passed — mirroring the "this element has N
relationships, delete anyway?" confirmation in the UI.

Errors are always `{ "error": { "code": "...", "message": "..." } }`, never a raw stack trace.

## Security notes

- Every request body/query is parsed through a Zod schema (`validators/parse.ts`); nothing
  from the frontend is trusted directly.
- Every Cypher query uses parameters for values. Labels and relationship types — which the
  driver cannot parameterize — are only ever interpolated from a fixed compile-time allowlist
  (`ONTOLOGY_LABELS`) or a value that has already passed `normalizeRelationshipType`'s regex
  (`^[A-Z][A-Z0-9_]{0,63}$`), so nothing resembling `"; MATCH ... "` can reach a query.
- Helmet, CORS (configurable origin), rate limiting and a request body size cap are all on by
  default (`plugins/security.ts`, `plugins/cors.ts`).
- `.env` is git-ignored; only `.env.example` is committed, with a placeholder password.
- What this app deliberately does **not** do: run any LLM, execute Rules/Agents/Policies, or
  implement anything from the future "Paperclip" consumer. Everything ontology-related here is
  modeled and stored, never executed.

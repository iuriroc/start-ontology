// Concatenates postgres/migrations/*.sql (in filename order) into one script
// that can be run at once in DBeaver / psql. Same SQL the API applies on boot,
// so the two can never drift apart. Run: npm run db:full-sql
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "postgres/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const header = `-- =====================================================================
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
-- Conteúdo: ${files.join(", ")}
-- =====================================================================

BEGIN;

`;

const footer = `
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
`;

const body = files
  .map((f) => `-- ---------------------------------------------------------------------\n-- ${f}\n-- ---------------------------------------------------------------------\n${readFileSync(path.join(dir, f), "utf-8").trim()}\n`)
  .join("\n");

const out = path.join(root, "postgres/full_setup.sql");
writeFileSync(out, header + body + footer);
console.log(`wrote ${path.relative(root, out)} (${files.length} migrations)`);

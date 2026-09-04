import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyBaseLogger } from "fastify";
import { getSession } from "./driver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/src/neo4j -> repo-root/neo4j/migrations
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../neo4j/migrations");

function splitStatements(cypherFile: string): string[] {
  return cypherFile
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Runs every .cypher file in neo4j/migrations, in filename order. All
 * statements use IF NOT EXISTS, so this is safe to run on every boot. */
export async function runMigrations(logger: FastifyBaseLogger): Promise<void> {
  let files: string[];
  try {
    files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".cypher")).sort();
  } catch {
    logger.warn({ dir: MIGRATIONS_DIR }, "no migrations directory found, skipping");
    return;
  }

  const session = getSession();
  try {
    for (const file of files) {
      const content = await readFile(path.join(MIGRATIONS_DIR, file), "utf-8");
      for (const statement of splitStatements(content)) {
        await session.run(statement);
      }
      logger.info({ file }, "applied migration");
    }
  } finally {
    await session.close();
  }
}

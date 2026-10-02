import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyBaseLogger } from "fastify";
import { withOwnerTransaction } from "./transaction.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "postgres/migrations"),
    path.resolve(__dirname, "../../../postgres/migrations"),
    path.resolve(__dirname, "../../../../postgres/migrations")
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0]!;
}
const MIGRATIONS_DIR = resolveMigrationsDir();

function stripComments(sqlFile: string): string {
  return sqlFile
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

/** Runs every .sql file in postgres/migrations, in filename order, inside a
 * single transaction. All statements use IF NOT EXISTS, so this is safe to
 * run on every boot. */
export async function runMigrations(logger: FastifyBaseLogger): Promise<void> {
  let files: string[];
  try {
    files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    logger.warn({ dir: MIGRATIONS_DIR }, "no migrations directory found, skipping");
    return;
  }

  await withOwnerTransaction(async (client) => {
    for (const file of files) {
      const content = await readFile(path.join(MIGRATIONS_DIR, file), "utf-8");
      await client.query(stripComments(content));
      logger.info({ file }, "applied migration");
    }
  });
}

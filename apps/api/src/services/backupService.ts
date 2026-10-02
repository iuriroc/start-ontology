import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { env } from "../config/env.js";
import { generateSqlExport } from "./sqlExport.js";
import { requireBusinessId } from "../postgres/tenantContext.js";
import { businessRepository } from "../repositories/businessRepository.js";
import { buildOntologySnapshot, countAllNodes, countAllRelationships } from "./ontologySnapshot.js";

export interface BackupManifest {
  format: "ontology-backup";
  formatVersion: "1.0";
  ontologyVersion: string | null;
  business?: { id: string; slug: string };
  createdAt: string;
  nodeCount: number;
  relationshipCount: number;
  checksum: string;
}

function timestampForFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/** Builds ontology.json + ontology.sql + manifest.json and zips them
 * (spec sections 35-38). Returns the zip as a buffer plus the filename it
 * should be saved/served as; the caller decides where it ends up. */
export async function createBackup(): Promise<{ filename: string; buffer: Buffer }> {
  const snapshot = await buildOntologySnapshot();
  const ontologyJson = JSON.stringify(snapshot, null, 2);
  const business = await businessRepository.findById(requireBusinessId());
  const sql = await generateSqlExport(snapshot, business ?? undefined);

  const checksum = createHash("sha256").update(ontologyJson).digest("hex");
  const [nodeCount, relationshipCount] = await Promise.all([
    countAllNodes(),
    countAllRelationships()
  ]);

  const manifest: BackupManifest = {
    format: "ontology-backup",
    formatVersion: "1.0",
    ontologyVersion: snapshot.metadata.version,
    ...(business ? { business: { id: business.id, slug: business.slug } } : {}),
    createdAt: snapshot.metadata.createdAt,
    nodeCount,
    relationshipCount,
    checksum
  };

  const zip = new AdmZip();
  zip.addFile("ontology.json", Buffer.from(ontologyJson, "utf-8"));
  zip.addFile("ontology.sql", Buffer.from(sql, "utf-8"));
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));

  const filename = `ontology-backup-${business?.slug ?? "business"}-${timestampForFilename(new Date())}.zip`;
  return { filename, buffer: zip.toBuffer() };
}

export async function saveBackupToDisk(filename: string, buffer: Buffer): Promise<string> {
  const dir = path.resolve(env.BACKUP_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await writeFile(filePath, buffer);
  return filePath;
}

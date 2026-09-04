import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDriver } from "../src/neo4j/driver.js";

/**
 * The restore validation pipeline (spec section 39) never touches Neo4j
 * until a plan is actually committed via /api/restore, so it can be fully
 * exercised here without a live database — including the checksum-tamper
 * case, which is the most security-relevant path in the whole app.
 */
function emptySnapshot() {
  return {
    metadata: { name: "test", version: null, createdAt: new Date().toISOString() },
    entities: [],
    concepts: [],
    relationships: [],
    rules: [],
    states: [],
    capabilities: [],
    agents: [],
    policies: [],
    issues: [],
    handoffs: [],
    decisions: [],
    executions: [],
    learningEvents: [],
    versions: [],
    versionContents: []
  };
}

function buildZip(ontologyJsonText: string, checksumOverride?: string) {
  const checksum = checksumOverride ?? createHash("sha256").update(ontologyJsonText).digest("hex");
  const manifest = {
    format: "ontology-backup",
    formatVersion: "1.0",
    ontologyVersion: null,
    createdAt: new Date().toISOString(),
    nodeCount: 0,
    relationshipCount: 0,
    checksum
  };
  const zip = new AdmZip();
  zip.addFile("ontology.json", Buffer.from(ontologyJsonText, "utf-8"));
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest), "utf-8"));
  return zip.toBuffer();
}

function multipartPayload(zipBuffer: Buffer, boundary: string) {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.zip"\r\nContent-Type: application/zip\r\n\r\n`
    ),
    zipBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
}

describe("POST /api/import validation pipeline", () => {
  const app = buildApp();
  const boundary = "----vitest-restore-boundary";

  afterAll(async () => {
    await app.close();
    await closeDriver();
  });

  it("rejects a request with no file", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.from(`--${boundary}--\r\n`)
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a file that isn't a zip", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartPayload(Buffer.from("not a zip"), boundary)
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("INVALID_BACKUP_FILE");
  });

  it("rejects a zip missing manifest.json/ontology.json", async () => {
    const zip = new AdmZip();
    zip.addFile("readme.txt", Buffer.from("nope"));
    const response = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartPayload(zip.toBuffer(), boundary)
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("INVALID_BACKUP_FILE");
  });

  it("rejects a tampered ontology.json (checksum mismatch)", async () => {
    const original = JSON.stringify(emptySnapshot());
    const zipBuffer = buildZip(original);

    // Re-open the zip and swap ontology.json for different content without
    // updating manifest.checksum — simulating tampering after the fact.
    const zip = new AdmZip(zipBuffer);
    zip.updateFile("ontology.json", Buffer.from(JSON.stringify({ ...emptySnapshot(), metadata: { ...emptySnapshot().metadata, name: "tampered" } })));

    const response = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartPayload(zip.toBuffer(), boundary)
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("CHECKSUM_MISMATCH");
  });

  it("rejects ontology.json that fails schema validation", async () => {
    const badJson = JSON.stringify({ not: "a valid snapshot" });
    const zipBuffer = buildZip(badJson);
    const response = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartPayload(zipBuffer, boundary)
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("SCHEMA_VALIDATION_FAILED");
  });

  it("accepts a well-formed, checksum-valid empty snapshot and stages it", async () => {
    const json = JSON.stringify(emptySnapshot());
    const zipBuffer = buildZip(json);
    const response = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartPayload(zipBuffer, boundary)
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.valid).toBe(true);
    expect(body.importId).toBeTruthy();
    expect(body.counts.entities).toBe(0);
  });

  it("rejects replace-mode restore without explicit confirmation", async () => {
    const json = JSON.stringify(emptySnapshot());
    const zipBuffer = buildZip(json);
    const imported = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartPayload(zipBuffer, boundary)
    });
    const { importId } = JSON.parse(imported.body);

    const response = await app.inject({
      method: "POST",
      url: "/api/restore",
      payload: { importId, mode: "replace" }
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("REPLACE_NOT_CONFIRMED");
  });

  it("rejects restore for an unknown/expired importId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/restore",
      payload: { importId: "11111111-1111-1111-1111-111111111111", mode: "merge" }
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("IMPORT_NOT_FOUND");
  });
});

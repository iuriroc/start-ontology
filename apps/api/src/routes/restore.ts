import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { recordAudit } from "../audit/auditLog.js";
import { badRequest } from "../errors.js";
import { discardPlan, stagePlan, takePlan } from "../services/importStore.js";
import { restore, validateBackupZip } from "../services/restoreService.js";
import { parseWith } from "../validators/parse.js";

const restoreBodySchema = z.object({
  importId: z.string().uuid(),
  mode: z.enum(["merge", "replace"]),
  confirmReplace: z.boolean().optional().default(false)
});

function summarize(snapshot: import("../validators/backupSchema.js").OntologySnapshot) {
  return {
    metadata: snapshot.metadata,
    counts: {
      entities: snapshot.entities.length,
      concepts: snapshot.concepts.length,
      relationships: snapshot.relationships.length,
      rules: snapshot.rules.length,
      states: snapshot.states.length,
      capabilities: snapshot.capabilities.length,
      agents: snapshot.agents.length,
      policies: snapshot.policies.length,
      issues: snapshot.issues.length,
      handoffs: snapshot.handoffs.length,
      decisions: snapshot.decisions.length,
      executions: snapshot.executions.length,
      learningEvents: snapshot.learningEvents.length,
      versions: snapshot.versions.length
    }
  };
}

/**
 * Import (validate) and Restore (commit) are deliberately two calls: the
 * spec's validation pipeline (section 39) must run and be shown to the user
 * — including the merge-vs-replace choice — before anything touches Postgres.
 */
export function registerRestoreRoutes(app: FastifyInstance): void {
  app.post("/import", async (request) => {
    const file = await request.file();
    if (!file) {
      throw badRequest("MISSING_FILE", "Upload a backup .zip file under the 'file' field");
    }
    const buffer = await file.toBuffer();

    let plan;
    try {
      plan = validateBackupZip(buffer);
    } catch (err) {
      await recordAudit(
        { action: "IMPORT", resourceType: "Ontology", resourceId: file.filename ?? "unknown", result: "FAILURE" },
        app.log
      );
      throw err;
    }

    const importId = stagePlan(plan);
    await recordAudit(
      { action: "IMPORT", resourceType: "Ontology", resourceId: importId, result: "SUCCESS" },
      app.log
    );
    return { importId, valid: true, ...summarize(plan.snapshot) };
  });

  app.post("/restore", async (request) => {
    const body = parseWith(restoreBodySchema, request.body);

    if (body.mode === "replace" && !body.confirmReplace) {
      throw badRequest(
        "REPLACE_NOT_CONFIRMED",
        "Replace mode discards the current ontology — set confirmReplace: true to proceed"
      );
    }

    const plan = takePlan(body.importId);
    if (!plan) {
      throw badRequest(
        "IMPORT_NOT_FOUND",
        "No validated import found for this id (it may have expired) — upload the backup again via /api/import"
      );
    }

    await restore(plan, body.mode);
    discardPlan(body.importId);

    await recordAudit(
      { action: "RESTORE", resourceType: "Ontology", resourceId: body.importId, result: "SUCCESS" },
      app.log
    );
    return { restored: true, mode: body.mode, ...summarize(plan.snapshot) };
  });
}

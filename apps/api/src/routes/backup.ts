import type { FastifyInstance } from "fastify";
import { recordAudit } from "../audit/auditLog.js";
import { createBackup, saveBackupToDisk } from "../services/backupService.js";

export function registerBackupRoutes(app: FastifyInstance): void {
  app.post("/backup", async () => {
    const { filename, buffer } = await createBackup();
    const filePath = await saveBackupToDisk(filename, buffer);
    await recordAudit(
      { action: "BACKUP", resourceType: "Ontology", resourceId: filename, result: "SUCCESS" },
      app.log
    );
    return { filename, path: filePath, sizeBytes: buffer.length };
  });

  app.get("/export", async (_request, reply) => {
    const { filename, buffer } = await createBackup();
    await recordAudit(
      { action: "EXPORT", resourceType: "Ontology", resourceId: filename, result: "SUCCESS" },
      app.log
    );
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(buffer);
  });
}

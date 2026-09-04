import { useRef, useState } from "react";
import { ApiError, api, uploadImport } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface BackupResult {
  filename: string;
  path: string;
  sizeBytes: number;
}

interface ImportSummary {
  importId: string;
  valid: boolean;
  metadata: { name: string; version: string | null; createdAt: string };
  counts: Record<string, number>;
}

/** Sections 35-41: backup (zip with ontology.json/.cypher + manifest),
 * restore with a merge/replace choice, and server-to-server transfer —
 * the same zip downloaded here is what gets imported on another instance. */
export function BackupRestorePage() {
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [creatingBackup, setCreatingBackup] = useState(false);

  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createBackup = async () => {
    setCreatingBackup(true);
    setBackupError(null);
    try {
      const result = await api.post<BackupResult>("/backup");
      setBackupResult(result);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setImportError(null);
    setImportSummary(null);
    setRestoreResult(null);
    try {
      const summary = await uploadImport<ImportSummary>(file);
      setImportSummary(summary);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Import validation failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const runRestore = async (confirmed: boolean) => {
    if (!importSummary) return;
    if (mode === "replace" && !confirmed) {
      setConfirmingReplace(true);
      return;
    }
    setConfirmingReplace(false);
    try {
      const result = await api.post<{ restored: boolean }>("/restore", {
        importId: importSummary.importId,
        mode,
        confirmReplace: mode === "replace"
      });
      setRestoreResult(result.restored ? `Ontology restored (${mode} mode).` : "Restore did not complete.");
      setImportSummary(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Restore failed");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Backup &amp; Restore</h2>
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Backup</h3>
        <p className="muted">
          Generates ontology.json, ontology.cypher and manifest.json (with checksum), zipped together and
          saved on the server under <code>backups/</code>.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" onClick={() => void createBackup()} disabled={creatingBackup}>
            {creatingBackup ? "Creating…" : "Create Backup"}
          </button>
          <a className="btn" href={`${api.baseUrl}/api/export`}>
            Download Export (.zip)
          </a>
        </div>
        {backupError && <div className="banner banner-error">{backupError}</div>}
        {backupResult && (
          <div className="banner banner-info">
            Saved {backupResult.filename} ({Math.round(backupResult.sizeBytes / 1024)} KB) to {backupResult.path}
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Restore</h3>
        <p className="muted">
          Upload a backup .zip to validate it (file, manifest, checksum, schema, ids, relationships, versions),
          then choose merge or replace to commit it to Neo4j.
        </p>
        <input ref={fileInputRef} type="file" accept=".zip" onChange={(e) => void handleFileSelected(e)} />
        {uploading && <p className="muted">Validating…</p>}
        {importError && <div className="banner banner-error">{importError}</div>}

        {importSummary && (
          <div style={{ marginTop: 14 }}>
            <div className="banner banner-info">
              Valid backup — {importSummary.metadata.version ?? "unversioned"}, created{" "}
              {new Date(importSummary.metadata.createdAt).toLocaleString()}
            </div>
            <table>
              <tbody>
                {Object.entries(importSummary.counts).map(([key, count]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="field" style={{ marginTop: 14 }}>
              <label>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as "merge" | "replace")}>
                <option value="merge">Merge (upsert by id, keep everything else)</option>
                <option value="replace">Replace (wipe the current ontology first)</option>
              </select>
            </div>
            <div className="form-actions">
              <button className={mode === "replace" ? "btn btn-danger" : "btn btn-primary"} onClick={() => void runRestore(false)}>
                Restore
              </button>
            </div>
          </div>
        )}

        {restoreResult && <div className="banner banner-info">{restoreResult}</div>}
      </div>

      {confirmingReplace && (
        <ConfirmDialog
          title="Replace the entire ontology?"
          message="This deletes every current ontology element before restoring from the backup. This cannot be undone."
          confirmLabel="Replace"
          danger
          onCancel={() => setConfirmingReplace(false)}
          onConfirm={() => void runRestore(true)}
        />
      )}
    </div>
  );
}

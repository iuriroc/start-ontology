import { useRef, useState } from "react";
import { ApiError, api, uploadImport } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { HelpPanel } from "../components/HelpPanel";

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
      setBackupError(err instanceof Error ? err.message : "Não foi possível gerar a cópia de segurança");
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
      setImportError(err instanceof ApiError ? err.message : "Não foi possível validar o arquivo");
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
      setRestoreResult(
        result.restored
          ? `Ontologia restaurada (modo ${mode === "merge" ? "mesclar" : "substituir"}).`
          : "A restauração não foi concluída."
      );
      setImportSummary(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Não foi possível restaurar");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>💾 Cópias de Segurança</h2>
      </div>

      <HelpPanel
        title='O que é "Cópia de Segurança"?'
        text="Um arquivo .zip com toda a sua ontologia — dá para guardar, restaurar depois, ou levar para outro servidor. Nada aqui muda sua ontologia atual até você confirmar uma restauração."
        example="Ex.: fazer backup antes de uma grande limpeza, ou transferir a ontologia para outro ambiente"
      />

      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Gerar cópia de segurança</h3>
        <p className="muted">
          Gera o arquivo completo (dados + script de reconstrução + verificação de integridade), salvo no
          servidor em <code>backups/</code>.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" onClick={() => void createBackup()} disabled={creatingBackup}>
            {creatingBackup ? "Gerando…" : "Gerar cópia de segurança"}
          </button>
          <a className="btn" href={`${api.baseUrl}/api/export`}>
            Baixar cópia (.zip)
          </a>
        </div>
        {backupError && <div className="banner banner-error">{backupError}</div>}
        {backupResult && (
          <div className="banner banner-info">
            {backupResult.filename} salvo ({Math.round(backupResult.sizeBytes / 1024)} KB) em{" "}
            {backupResult.path}
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Restaurar</h3>
        <p className="muted">
          Envie um arquivo .zip para conferir se ele é válido (arquivo, integridade, formato, ids, conexões,
          versões) antes de decidir como aplicá-lo.
        </p>
        <input ref={fileInputRef} type="file" accept=".zip" onChange={(e) => void handleFileSelected(e)} />
        {uploading && <p className="muted">Validando…</p>}
        {importError && <div className="banner banner-error">{importError}</div>}

        {importSummary && (
          <div style={{ marginTop: 14 }}>
            <div className="banner banner-info">
              Arquivo válido — {importSummary.metadata.version ?? "sem versão"}, gerado em{" "}
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
              <label>Como aplicar</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as "merge" | "replace")}>
                <option value="merge">Mesclar (atualiza pelo id, mantém o resto como está)</option>
                <option value="replace">Substituir (apaga a ontologia atual antes de restaurar)</option>
              </select>
            </div>
            <div className="form-actions">
              <button className={mode === "replace" ? "btn btn-danger" : "btn btn-primary"} onClick={() => void runRestore(false)}>
                Restaurar
              </button>
            </div>
          </div>
        )}

        {restoreResult && <div className="banner banner-info">{restoreResult}</div>}
      </div>

      {confirmingReplace && (
        <ConfirmDialog
          title="Substituir toda a ontologia?"
          message="Isso apaga tudo o que existe hoje antes de restaurar a partir do arquivo. Não é possível desfazer."
          confirmLabel="Substituir"
          danger
          onCancel={() => setConfirmingReplace(false)}
          onConfirm={() => void runRestore(true)}
        />
      )}
    </div>
  );
}

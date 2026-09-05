import { useState } from "react";
import { RESOURCE_LIST, type OntologyLabel } from "@ontology-builder/shared";
import { api } from "../api/client";
import { ElementPicker } from "../components/ElementPicker";
import { HelpPanel } from "../components/HelpPanel";
import { StatusBadge } from "../components/StatusBadge";
import { useResourceList } from "../hooks/useResource";

interface VersionRecord {
  id: string;
  version: string;
  description?: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdBy: string;
  createdAt: string;
}

/** Section 21-22: draft -> publish -> archive lifecycle, plus attaching
 * elements to a draft version's CONTAINS set before publishing. */
export function VersionsPage() {
  const { items, loading, error, refresh } = useResourceList<VersionRecord>("versions");
  const [form, setForm] = useState({ version: "", description: "", createdBy: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [attachTarget, setAttachTarget] = useState<string | null>(null);
  const [attachLabel, setAttachLabel] = useState<OntologyLabel>("Entity");
  const [attachId, setAttachId] = useState("");

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.version) {
      setFormError("Informe uma versão, ex.: 1.0.0");
      return;
    }
    try {
      await api.post("/versions", { ...form, createdBy: form.createdBy || "sistema" });
      setForm({ version: "", description: "", createdBy: "" });
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível criar a versão");
    }
  };

  const publish = async (id: string) => {
    await api.post(`/versions/${id}/publish`);
    await refresh();
  };
  const archive = async (id: string) => {
    await api.post(`/versions/${id}/archive`);
    await refresh();
  };
  const remove = async (id: string) => {
    await api.delete(`/versions/${id}`);
    await refresh();
  };
  const attach = async (versionId: string) => {
    if (!attachId) return;
    await api.post(`/versions/${versionId}/contents`, { label: attachLabel, elementId: attachId });
    setAttachId("");
    setAttachTarget(null);
  };

  return (
    <div>
      <div className="page-header">
        <h2>🏷️ Histórico de Versões</h2>
      </div>

      <HelpPanel
        title='O que é "Histórico de Versões"?'
        text="Um marco no tempo da sua ontologia. Crie uma versão em rascunho, escolha o que ela contém, e publique quando estiver pronta. Versões publicadas nunca são apagadas."
        example='Ex.: "1.0.0 — primeira versão com Cliente, Pedido e a conexão entre eles"'
      />

      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <form onSubmit={create}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 14 }}>
            <div className="field">
              <label>Versão</label>
              <input
                placeholder="1.0.0"
                value={form.version}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Descrição</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Criado por</label>
              <input
                placeholder="sistema"
                value={form.createdBy}
                onChange={(e) => setForm((f) => ({ ...f, createdBy: e.target.value }))}
              />
            </div>
          </div>
          {formError && <div className="banner banner-error">{formError}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Criar versão em rascunho
            </button>
          </div>
        </form>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Versão</th>
              <th>Descrição</th>
              <th>Status</th>
              <th>Criado por</th>
              <th>Criado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6}>Carregando…</td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Nenhuma versão ainda.
                </td>
              </tr>
            )}
            {items.map((v) => (
              <tr key={v.id}>
                <td>{v.version}</td>
                <td>{v.description}</td>
                <td>
                  <StatusBadge status={v.status} />
                </td>
                <td>{v.createdBy}</td>
                <td>{new Date(v.createdAt).toLocaleString()}</td>
                <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {v.status === "DRAFT" && (
                    <>
                      <button className="btn" onClick={() => setAttachTarget(attachTarget === v.id ? null : v.id)}>
                        Adicionar itens
                      </button>
                      <button className="btn btn-primary" onClick={() => void publish(v.id)}>
                        Publicar
                      </button>
                      <button className="btn btn-danger" onClick={() => void remove(v.id)}>
                        Excluir
                      </button>
                    </>
                  )}
                  {v.status === "PUBLISHED" && (
                    <button className="btn" onClick={() => void archive(v.id)}>
                      Arquivar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {attachTarget && (
        <div className="panel" style={{ padding: 18, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Adicionar item a esta versão</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Tipo de bloco</label>
              <select value={attachLabel} onChange={(e) => setAttachLabel(e.target.value as OntologyLabel)}>
                {RESOURCE_LIST.map((r) => (
                  <option key={r.label} value={r.label}>
                    {r.icon} {r.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Item</label>
              <ElementPicker label={attachLabel} value={attachId} onChange={setAttachId} />
            </div>
            <button className="btn btn-primary" onClick={() => void attach(attachTarget)}>
              Adicionar
            </button>
            <button className="btn" onClick={() => setAttachTarget(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

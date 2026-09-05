import { useState } from "react";
import { RESOURCE_LIST } from "@ontology-builder/shared";
import { ApiError, api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ElementPicker } from "../components/ElementPicker";
import { HelpPanel } from "../components/HelpPanel";
import { StatusBadge } from "../components/StatusBadge";
import { useResourceList } from "../hooks/useResource";

interface HandoffRecord {
  id: string;
  name: string;
  fromAgentId: string;
  toAgentId: string;
  reason?: string;
  condition?: string;
  priority: number;
  status: string;
}

const meta = RESOURCE_LIST.find((r) => r.key === "handoffs")!;

/** Section 17: Agent A -[:HANDOFF_TO]-> Agent B, with reason/condition/priority. */
export function HandoffsPage() {
  const { items, loading, error, refresh } = useResourceList<HandoffRecord>("handoffs");
  const [form, setForm] = useState({
    name: "",
    fromAgentId: "",
    toAgentId: "",
    reason: "",
    condition: "",
    priority: 0
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; relCount: number } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name || !form.fromAgentId || !form.toAgentId) {
      setFormError("Preencha nome, agente de origem e agente de destino");
      return;
    }
    try {
      await api.post("/handoffs", form);
      setForm((f) => ({ ...f, name: "", fromAgentId: "", toAgentId: "", reason: "", condition: "" }));
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível criar o handoff");
    }
  };

  const attemptDelete = async (id: string, force: boolean) => {
    try {
      await api.delete(`/handoffs/${id}${force ? "?hard=true&force=true" : "?hard=true"}`);
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const match = err.message.match(/has (\d+) relationship/);
        setPendingDelete({ id, relCount: match ? Number(match[1]) : 0 });
      }
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>
          <span className="nav-icon">{meta.icon}</span> {meta.displayName}
        </h2>
      </div>

      <HelpPanel title={`O que é "${meta.displayName}"?`} text={meta.helpText} example={meta.example} />

      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field">
              <label>Agente que repassa</label>
              <ElementPicker label="Agent" value={form.fromAgentId} onChange={(id) => setForm((f) => ({ ...f, fromAgentId: id }))} />
            </div>
            <div className="field">
              <label>Agente que recebe</label>
              <ElementPicker label="Agent" value={form.toAgentId} onChange={(id) => setForm((f) => ({ ...f, toAgentId: id }))} />
            </div>
          </div>
          <div className="field">
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="field">
            <label>Motivo</label>
            <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          <div className="field">
            <label>Condição</label>
            <textarea value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))} />
          </div>
          <div className="field">
            <label>Prioridade</label>
            <input
              type="number"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
            />
          </div>
          {formError && <div className="banner banner-error">{formError}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Criar handoff
            </button>
          </div>
        </form>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Prioridade</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4}>Carregando…</td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Nenhum handoff ainda. Crie o primeiro acima.
                </td>
              </tr>
            )}
            {items.map((h) => (
              <tr key={h.id}>
                <td>{h.name}</td>
                <td>{h.priority}</td>
                <td>
                  <StatusBadge status={h.status} />
                </td>
                <td>
                  <button className="btn btn-danger" onClick={() => void attemptDelete(h.id, false)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Este handoff está referenciado em outro lugar"
          message={`Este handoff tem ${pendingDelete.relCount} vínculo(s) associado(s). Excluir mesmo assim?`}
          confirmLabel="Excluir mesmo assim"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void attemptDelete(pendingDelete.id, true)}
        />
      )}
    </div>
  );
}

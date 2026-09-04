import { useState } from "react";
import { ApiError, api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ElementPicker } from "../components/ElementPicker";
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
      setFormError("Fill in name, from agent and to agent");
      return;
    }
    try {
      await api.post("/handoffs", form);
      setForm((f) => ({ ...f, name: "", fromAgentId: "", toAgentId: "", reason: "", condition: "" }));
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create handoff");
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
        <h2>Handoffs</h2>
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field">
              <label>From Agent</label>
              <ElementPicker label="Agent" value={form.fromAgentId} onChange={(id) => setForm((f) => ({ ...f, fromAgentId: id }))} />
            </div>
            <div className="field">
              <label>To Agent</label>
              <ElementPicker label="Agent" value={form.toAgentId} onChange={(id) => setForm((f) => ({ ...f, toAgentId: id }))} />
            </div>
          </div>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="field">
            <label>Reason</label>
            <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          <div className="field">
            <label>Condition</label>
            <textarea value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))} />
          </div>
          <div className="field">
            <label>Priority</label>
            <input
              type="number"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
            />
          </div>
          {formError && <div className="banner banner-error">{formError}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Create handoff
            </button>
          </div>
        </form>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Priority</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4}>Loading…</td>
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
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="This handoff is referenced elsewhere"
          message={`This handoff has ${pendingDelete.relCount} related edge(s). Delete anyway?`}
          confirmLabel="Delete anyway"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void attemptDelete(pendingDelete.id, true)}
        />
      )}
    </div>
  );
}

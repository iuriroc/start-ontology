import { useState } from "react";
import { RELATABLE_LABELS, type OntologyLabel } from "@ontology-builder/shared";
import { ApiError, api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ElementPicker } from "../components/ElementPicker";
import { StatusBadge } from "../components/StatusBadge";
import { useResourceList } from "../hooks/useResource";

interface RelationshipRecord {
  id: string;
  name: string;
  type: string;
  sourceLabel: OntologyLabel;
  sourceId: string;
  targetLabel: OntologyLabel;
  targetId: string;
  cardinality: string;
  status: string;
}

const CARDINALITIES = ["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_ONE", "MANY_TO_MANY"];

/** Section 32's "FROM / RELATIONSHIP / TO" builder. Kept as its own page
 * instead of the generic ResourcePage because it needs cross-label
 * endpoint pickers, not plain text fields. */
export function RelationshipsPage() {
  const { items, loading, error, refresh } = useResourceList<RelationshipRecord>("relationships");
  const [form, setForm] = useState({
    name: "",
    type: "",
    sourceLabel: "Entity" as OntologyLabel,
    sourceId: "",
    targetLabel: "Entity" as OntologyLabel,
    targetId: "",
    cardinality: "MANY_TO_MANY"
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; relCount: number } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name || !form.type || !form.sourceId || !form.targetId) {
      setFormError("Fill in name, relationship type, source and target");
      return;
    }
    try {
      await api.post("/relationships", form);
      setForm((f) => ({ ...f, name: "", type: "", sourceId: "", targetId: "" }));
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create relationship");
    }
  };

  const attemptDelete = async (id: string, force: boolean) => {
    try {
      await api.delete(`/relationships/${id}${force ? "?hard=true&force=true" : "?hard=true"}`);
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
        <h2>Relationships</h2>
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div className="field">
              <label>From</label>
              <select
                value={form.sourceLabel}
                onChange={(e) => setForm((f) => ({ ...f, sourceLabel: e.target.value as OntologyLabel, sourceId: "" }))}
              >
                {RELATABLE_LABELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <ElementPicker
                label={form.sourceLabel}
                value={form.sourceId}
                onChange={(id) => setForm((f) => ({ ...f, sourceId: id }))}
              />
            </div>
            <div className="field">
              <label>Relationship</label>
              <input
                placeholder="e.g. OWNS"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, name: f.name || e.target.value }))}
              />
              <select
                value={form.cardinality}
                onChange={(e) => setForm((f) => ({ ...f, cardinality: e.target.value }))}
              >
                {CARDINALITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>To</label>
              <select
                value={form.targetLabel}
                onChange={(e) => setForm((f) => ({ ...f, targetLabel: e.target.value as OntologyLabel, targetId: "" }))}
              >
                {RELATABLE_LABELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <ElementPicker
                label={form.targetLabel}
                value={form.targetId}
                onChange={(id) => setForm((f) => ({ ...f, targetId: id }))}
              />
            </div>
          </div>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          {formError && <div className="banner banner-error">{formError}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Create relationship
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
              <th>Type</th>
              <th>From</th>
              <th>To</th>
              <th>Cardinality</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7}>Loading…</td>
              </tr>
            )}
            {items.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>
                  <code>{r.type}</code>
                </td>
                <td>
                  {r.sourceLabel}:{r.sourceId.slice(0, 8)}
                </td>
                <td>
                  {r.targetLabel}:{r.targetId.slice(0, 8)}
                </td>
                <td>{r.cardinality}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td>
                  <button className="btn btn-danger" onClick={() => void attemptDelete(r.id, false)}>
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
          title="This relationship is referenced elsewhere"
          message={`This relationship has ${pendingDelete.relCount} related edge(s) (e.g. version membership). Delete anyway?`}
          confirmLabel="Delete anyway"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void attemptDelete(pendingDelete.id, true)}
        />
      )}
    </div>
  );
}

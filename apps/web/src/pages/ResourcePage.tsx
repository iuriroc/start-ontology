import { useState } from "react";
import { useParams } from "react-router-dom";
import { RESOURCE_LIST } from "@ontology-builder/shared";
import { ApiError, api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RecordFormModal, type FormValues } from "../components/RecordFormModal";
import { StatusBadge } from "../components/StatusBadge";
import { RESOURCE_FIELDS } from "../features/resourceFields";
import { useResourceList } from "../hooks/useResource";

interface OntologyRecord extends FormValues {
  id: string;
  name: string;
  status: string;
  version: string;
  updatedAt: string;
}

/** Generic list/create/edit/archive/delete page for every simple CRUD
 * resource (spec section 30-31). Relationships and Handoffs get their own
 * pages because they need endpoint pickers instead of plain fields. */
export function ResourcePage() {
  const { resource } = useParams<{ resource: string }>();
  const meta = RESOURCE_LIST.find((r) => r.path === resource);
  const fields = resource ? (RESOURCE_FIELDS[resource] ?? []) : [];
  const { items, loading, error, refresh } = useResourceList<OntologyRecord>(resource ?? "");

  const [editing, setEditing] = useState<OntologyRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; hard: boolean; relCount: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!meta || !resource) return <p>Unknown resource.</p>;

  const emptyValues: FormValues = Object.fromEntries(
    fields.map((f) => {
      if (f.type === "boolean") return [f.key, false];
      if (f.type === "properties") return [f.key, []];
      if (f.type === "number") return [f.key, 0];
      if (f.type === "select") return [f.key, f.options?.[0] ?? ""];
      return [f.key, ""];
    })
  );

  const handleCreate = async (values: FormValues) => {
    await api.post(`/${resource}`, values);
    setCreating(false);
    await refresh();
  };

  const handleUpdate = async (values: FormValues) => {
    if (!editing) return;
    await api.put(`/${resource}/${editing.id}`, values);
    setEditing(null);
    await refresh();
  };

  const attemptDelete = async (id: string, hard: boolean, force: boolean) => {
    setActionError(null);
    try {
      const query = new URLSearchParams();
      if (hard) query.set("hard", "true");
      if (force) query.set("force", "true");
      await api.delete(`/${resource}/${id}?${query.toString()}`);
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const match = err.message.match(/has (\d+) relationship/);
        setPendingDelete({ id, hard, relCount: match ? Number(match[1]) : 0 });
      } else {
        setActionError(err instanceof Error ? err.message : "Action failed");
      }
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>{meta.displayName}</h2>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New {meta.displayName.replace(/s$/, "")}
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {actionError && <div className="banner banner-error">{actionError}</div>}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Version</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5}>Loading…</td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No {meta.displayName.toLowerCase()} yet.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
                <td>{item.version}</td>
                <td>{new Date(item.updatedAt).toLocaleString()}</td>
                <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => setEditing(item)}>
                    Edit
                  </button>
                  {item.status !== "ARCHIVED" && (
                    <button className="btn" onClick={() => void attemptDelete(item.id, false, false)}>
                      Archive
                    </button>
                  )}
                  <button className="btn btn-danger" onClick={() => void attemptDelete(item.id, true, false)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <RecordFormModal
          title={`New ${meta.displayName.replace(/s$/, "")}`}
          fields={fields}
          initialValues={emptyValues}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {editing && (
        <RecordFormModal
          title={`Edit ${editing.name}`}
          fields={fields}
          initialValues={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
          submitLabel="Save changes"
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="This element has relationships"
          message={`This element has ${pendingDelete.relCount} relationship(s). Do you really want to ${
            pendingDelete.hard ? "permanently delete" : "archive"
          } it?`}
          confirmLabel={pendingDelete.hard ? "Delete anyway" : "Archive anyway"}
          danger={pendingDelete.hard}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void attemptDelete(pendingDelete.id, pendingDelete.hard, true)}
        />
      )}
    </div>
  );
}

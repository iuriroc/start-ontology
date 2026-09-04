import { useState } from "react";
import type { FieldConfig } from "../features/resourceFields";
import { PropertiesEditor, type EntityPropertyDraft } from "./PropertiesEditor";

export type FormValues = Record<string, unknown>;

interface RecordFormModalProps {
  title: string;
  fields: FieldConfig[];
  initialValues: FormValues;
  onSubmit: (values: FormValues) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
}

export function RecordFormModal({
  title,
  fields,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save"
}: RecordFormModalProps) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const field of fields) {
      if (field.required && !values[field.key]) {
        setError(`${field.label} is required`);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {error && <div className="banner banner-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          {fields.map((field) => (
            <div className="field" key={field.key}>
              <label>
                {field.label}
                {field.required ? " *" : ""}
              </label>
              {field.type === "text" && (
                <input
                  type="text"
                  value={(values[field.key] as string) ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              )}
              {field.type === "textarea" && (
                <textarea
                  value={(values[field.key] as string) ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              )}
              {field.type === "number" && (
                <input
                  type="number"
                  value={(values[field.key] as number) ?? 0}
                  onChange={(e) => setField(field.key, Number(e.target.value))}
                />
              )}
              {field.type === "select" && (
                <select
                  value={(values[field.key] as string) ?? field.options?.[0]}
                  onChange={(e) => setField(field.key, e.target.value)}
                >
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
              {field.type === "boolean" && (
                <div className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(values[field.key])}
                    onChange={(e) => setField(field.key, e.target.checked)}
                  />
                </div>
              )}
              {field.type === "properties" && (
                <PropertiesEditor
                  value={(values[field.key] as EntityPropertyDraft[]) ?? []}
                  onChange={(next) => setField(field.key, next)}
                />
              )}
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export interface EntityPropertyDraft {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

const PROPERTY_TYPES = ["STRING", "INTEGER", "FLOAT", "BOOLEAN", "DATE", "DATETIME", "UUID", "JSON"];

interface PropertiesEditorProps {
  value: EntityPropertyDraft[];
  onChange: (next: EntityPropertyDraft[]) => void;
}

/** Section 31: lets the user add typed properties to an Entity without
 * writing any Cypher — plain name/type/required rows. */
export function PropertiesEditor({ value, onChange }: PropertiesEditorProps) {
  const update = (index: number, patch: Partial<EntityPropertyDraft>) => {
    onChange(value.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { name: "", type: "STRING", required: false }]);

  return (
    <div className="properties-list">
      {value.length === 0 && <p className="muted">No properties yet.</p>}
      {value.map((prop, i) => (
        <div className="property-row" key={i}>
          <input
            placeholder="name"
            value={prop.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <select value={prop.type} onChange={(e) => update(i, { type: e.target.value })}>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="checkbox-row" style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={prop.required}
              onChange={(e) => update(i, { required: e.target.checked })}
            />
            required
          </label>
          <button type="button" className="btn btn-danger" onClick={() => remove(i)}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn" onClick={add}>
        + Add property
      </button>
    </div>
  );
}

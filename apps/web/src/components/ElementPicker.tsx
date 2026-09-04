import { RESOURCE_LIST, type OntologyLabel } from "@ontology-builder/shared";
import { useResourceList } from "../hooks/useResource";

interface ElementOption {
  id: string;
  name: string;
}

const labelToPath = new Map(RESOURCE_LIST.map((r) => [r.label, r.path]));

/** Dropdown of existing elements for a given label — the "FROM [Customer ▼]"
 * picker from spec section 32, kept generic across every relatable label. */
export function ElementPicker({
  label,
  value,
  onChange
}: {
  label: OntologyLabel;
  value: string;
  onChange: (id: string) => void;
}) {
  const path = labelToPath.get(label) ?? "";
  const { items, loading } = useResourceList<ElementOption>(path);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={loading || !path}>
      <option value="">{loading ? "Loading…" : "Select…"}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}

import { RESOURCE_LIST } from "@ontology-builder/shared";

/** One color per ontology label so the canvas reads at a glance (spec section
 * 33) — sourced from RESOURCE_LIST so the graph and the sidebar dots never
 * drift apart. */
export const NODE_COLORS: Record<string, string> = Object.fromEntries(
  RESOURCE_LIST.map((r) => [r.label, r.color])
);

export function colorFor(type: string): string {
  return NODE_COLORS[type] ?? "#6b7280";
}

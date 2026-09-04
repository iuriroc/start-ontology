/** One color per Neo4j label so the canvas reads at a glance (spec section 33). */
export const NODE_COLORS: Record<string, string> = {
  Entity: "#3454d1",
  Concept: "#7c3aed",
  RelationshipDefinition: "#64748b",
  Rule: "#ea580c",
  State: "#0891b2",
  Capability: "#059669",
  Agent: "#db2777",
  Policy: "#b45309",
  Issue: "#dc2626",
  Handoff: "#4f46e5",
  Decision: "#0d9488",
  Execution: "#7c2d12",
  LearningEvent: "#65a30d"
};

export function colorFor(type: string): string {
  return NODE_COLORS[type] ?? "#6b7280";
}

export type FieldType = "text" | "textarea" | "number" | "boolean" | "select" | "properties";

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
}

const STATUS_FIELD: FieldConfig = {
  key: "status",
  label: "Status",
  type: "select",
  options: ["DRAFT", "ACTIVE", "ARCHIVED"]
};

const NAME_FIELD: FieldConfig = { key: "name", label: "Name", type: "text", required: true };
const DESCRIPTION_FIELD: FieldConfig = { key: "description", label: "Description", type: "textarea" };

/** UI form fields per simple CRUD resource. Purely presentational — the API
 * is the actual source of validation truth (spec section 25); this only
 * drives which inputs render and basic client-side required checks. */
export const RESOURCE_FIELDS: Record<string, FieldConfig[]> = {
  entities: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    { key: "domain", label: "Domain", type: "text" },
    STATUS_FIELD,
    { key: "properties", label: "Properties", type: "properties" }
  ],
  concepts: [NAME_FIELD, DESCRIPTION_FIELD, STATUS_FIELD],
  rules: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "condition", label: "WHEN (condition)", type: "textarea", required: true },
    { key: "action", label: "THEN (action)", type: "textarea", required: true },
    { key: "priority", label: "Priority", type: "number" }
  ],
  states: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "initial", label: "Initial state", type: "boolean" },
    { key: "final", label: "Final state", type: "boolean" }
  ],
  capabilities: [NAME_FIELD, DESCRIPTION_FIELD, STATUS_FIELD, { key: "code", label: "Code", type: "text" }],
  agents: [NAME_FIELD, DESCRIPTION_FIELD, STATUS_FIELD, { key: "role", label: "Role", type: "text", required: true }],
  policies: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "effect", label: "Effect", type: "select", options: ["ALLOW", "DENY"], required: true },
    { key: "conditions", label: "Conditions", type: "textarea" },
    { key: "priority", label: "Priority", type: "number" }
  ],
  issues: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "category", label: "Category", type: "text", required: true },
    { key: "priority", label: "Priority", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] }
  ],
  decisions: [NAME_FIELD, DESCRIPTION_FIELD, STATUS_FIELD, { key: "reason", label: "Reason", type: "textarea" }],
  executions: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    {
      key: "executionStatus",
      label: "Execution status",
      type: "select",
      options: ["PENDING", "RUNNING", "COMPLETED", "FAILED"]
    },
    { key: "startedAt", label: "Started at (ISO)", type: "text" },
    { key: "finishedAt", label: "Finished at (ISO)", type: "text" }
  ],
  "learning-events": [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "type", label: "Type", type: "text", required: true },
    { key: "source", label: "Source", type: "text", required: true },
    { key: "result", label: "Result", type: "textarea" }
  ]
};

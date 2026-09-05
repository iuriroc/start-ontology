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

const NAME_FIELD: FieldConfig = { key: "name", label: "Nome", type: "text", required: true };
const DESCRIPTION_FIELD: FieldConfig = { key: "description", label: "Descrição", type: "textarea" };

/** Campos de formulário por recurso (em português simples). Só o visual —
 * quem valida de verdade é a API (spec seção 25); aqui é só o que aparece
 * na tela e a checagem básica de obrigatoriedade. */
export const RESOURCE_FIELDS: Record<string, FieldConfig[]> = {
  entities: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    { key: "domain", label: "Área do negócio", type: "text" },
    STATUS_FIELD,
    { key: "properties", label: "Campos deste cadastro", type: "properties" }
  ],
  concepts: [NAME_FIELD, DESCRIPTION_FIELD, STATUS_FIELD],
  rules: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "condition", label: "SE (condição)", type: "textarea", required: true },
    { key: "action", label: "ENTÃO (resultado)", type: "textarea", required: true },
    { key: "priority", label: "Prioridade", type: "number" }
  ],
  states: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "initial", label: "É a situação inicial?", type: "boolean" },
    { key: "final", label: "É a situação final?", type: "boolean" }
  ],
  capabilities: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "code", label: "Código (opcional)", type: "text" }
  ],
  agents: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "role", label: "Função", type: "text", required: true }
  ],
  policies: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "effect", label: "Efeito", type: "select", options: ["ALLOW", "DENY"], required: true },
    { key: "conditions", label: "Condições", type: "textarea" },
    { key: "priority", label: "Prioridade", type: "number" }
  ],
  issues: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "category", label: "Categoria", type: "text", required: true },
    { key: "priority", label: "Prioridade", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] }
  ],
  decisions: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "reason", label: "Motivo", type: "textarea" }
  ],
  executions: [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    {
      key: "executionStatus",
      label: "Status da execução",
      type: "select",
      options: ["PENDING", "RUNNING", "COMPLETED", "FAILED"]
    },
    { key: "startedAt", label: "Início (data/hora)", type: "text" },
    { key: "finishedAt", label: "Fim (data/hora)", type: "text" }
  ],
  "learning-events": [
    NAME_FIELD,
    DESCRIPTION_FIELD,
    STATUS_FIELD,
    { key: "type", label: "Tipo", type: "text", required: true },
    { key: "source", label: "Origem", type: "text", required: true },
    { key: "result", label: "Resultado", type: "textarea" }
  ]
};

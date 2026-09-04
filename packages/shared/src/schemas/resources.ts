import type { OntologyLabel } from "./labels.js";

/** Display/navigation metadata for each CRUD resource. No Zod coupling here
 * so both the API route registry and the web sidebar can share it. */
export interface ResourceMeta {
  key: string;
  label: OntologyLabel;
  path: string;
  displayName: string;
}

export const RESOURCE_LIST: ResourceMeta[] = [
  { key: "entities", label: "Entity", path: "entities", displayName: "Cadastros" },
  { key: "concepts", label: "Concept", path: "concepts", displayName: "Temas" },
  {
    key: "relationships",
    label: "RelationshipDefinition",
    path: "relationships",
    displayName: "Conexões"
  },
  { key: "rules", label: "Rule", path: "rules", displayName: "Regras" },
  { key: "states", label: "State", path: "states", displayName: "Situações" },
  {
    key: "capabilities",
    label: "Capability",
    path: "capabilities",
    displayName: "Habilidades"
  },
  { key: "agents", label: "Agent", path: "agents", displayName: "Agentes" },
  { key: "policies", label: "Policy", path: "policies", displayName: "Diretrizes" },
  { key: "issues", label: "Issue", path: "issues", displayName: "Ocorrências" },
  { key: "handoffs", label: "Handoff", path: "handoffs", displayName: "Handoff" },
  { key: "decisions", label: "Decision", path: "decisions", displayName: "Decisões" },
  { key: "executions", label: "Execution", path: "executions", displayName: "Atividades" },
  {
    key: "learning-events",
    label: "LearningEvent",
    path: "learning-events",
    displayName: "Aprendizados"
  }
];

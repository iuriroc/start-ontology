import {
  agentCreateSchema,
  agentUpdateSchema,
  capabilityCreateSchema,
  capabilityUpdateSchema,
  conceptCreateSchema,
  conceptUpdateSchema,
  decisionCreateSchema,
  decisionUpdateSchema,
  entityCreateSchema,
  entityUpdateSchema,
  executionCreateSchema,
  executionUpdateSchema,
  issueCreateSchema,
  issueUpdateSchema,
  learningEventCreateSchema,
  learningEventUpdateSchema,
  policyCreateSchema,
  policyUpdateSchema,
  ruleCreateSchema,
  ruleUpdateSchema,
  stateCreateSchema,
  stateUpdateSchema,
  type OntologyLabel
} from "@ontology-builder/shared";
import type { z } from "zod";

export interface SimpleResourceConfig {
  path: string;
  label: OntologyLabel;
  createSchema: z.ZodTypeAny;
  updateSchema: z.ZodTypeAny;
}

/** Every ontology resource whose persistence is plain CRUD on one label —
 * i.e. everything except Relationships, Handoffs (both create extra graph
 * edges) and OntologyVersion (its own lifecycle: draft/publish/archive). */
export const SIMPLE_RESOURCES: SimpleResourceConfig[] = [
  {
    path: "entities",
    label: "Entity",
    createSchema: entityCreateSchema,
    updateSchema: entityUpdateSchema
  },
  { path: "concepts", label: "Concept", createSchema: conceptCreateSchema, updateSchema: conceptUpdateSchema },
  { path: "rules", label: "Rule", createSchema: ruleCreateSchema, updateSchema: ruleUpdateSchema },
  { path: "states", label: "State", createSchema: stateCreateSchema, updateSchema: stateUpdateSchema },
  {
    path: "capabilities",
    label: "Capability",
    createSchema: capabilityCreateSchema,
    updateSchema: capabilityUpdateSchema
  },
  { path: "agents", label: "Agent", createSchema: agentCreateSchema, updateSchema: agentUpdateSchema },
  { path: "policies", label: "Policy", createSchema: policyCreateSchema, updateSchema: policyUpdateSchema },
  { path: "issues", label: "Issue", createSchema: issueCreateSchema, updateSchema: issueUpdateSchema },
  {
    path: "decisions",
    label: "Decision",
    createSchema: decisionCreateSchema,
    updateSchema: decisionUpdateSchema
  },
  {
    path: "executions",
    label: "Execution",
    createSchema: executionCreateSchema,
    updateSchema: executionUpdateSchema
  },
  {
    path: "learning-events",
    label: "LearningEvent",
    createSchema: learningEventCreateSchema,
    updateSchema: learningEventUpdateSchema
  }
];

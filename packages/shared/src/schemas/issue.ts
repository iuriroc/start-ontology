import { z } from "zod";
import { baseCreateFields, baseRecordFields } from "./common.js";

export const issuePrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const issueCreateSchema = z.object({
  ...baseCreateFields,
  category: z.string().trim().min(1).max(150),
  priority: issuePrioritySchema.default("MEDIUM")
});
export type IssueCreateInput = z.infer<typeof issueCreateSchema>;

export const issueUpdateSchema = issueCreateSchema.partial();
export type IssueUpdateInput = z.infer<typeof issueUpdateSchema>;

export const issueSchema = z.object({
  ...baseRecordFields,
  category: z.string(),
  priority: issuePrioritySchema
});
export type Issue = z.infer<typeof issueSchema>;

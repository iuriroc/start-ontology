import { describe, expect, it } from "vitest";
import { entityCreateSchema, relationshipCreateSchema, ruleCreateSchema } from "@ontology-builder/shared";

describe("entityCreateSchema", () => {
  it("accepts a minimal valid entity", () => {
    const result = entityCreateSchema.safeParse({ name: "Customer" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = entityCreateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("validates nested property definitions", () => {
    const result = entityCreateSchema.safeParse({
      name: "Customer",
      properties: [{ name: "email", type: "STRING", required: true }]
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown property type", () => {
    const result = entityCreateSchema.safeParse({
      name: "Customer",
      properties: [{ name: "email", type: "NOT_A_TYPE" }]
    });
    expect(result.success).toBe(false);
  });
});

describe("ruleCreateSchema", () => {
  it("requires condition and action", () => {
    expect(ruleCreateSchema.safeParse({ name: "VIP" }).success).toBe(false);
    expect(
      ruleCreateSchema.safeParse({ name: "VIP", condition: "TPV > 250000", action: "APPLY HighValueSeller" })
        .success
    ).toBe(true);
  });
});

describe("relationshipCreateSchema", () => {
  it("normalizes the relationship type and requires uuids for endpoints", () => {
    const result = relationshipCreateSchema.safeParse({
      name: "Owns",
      type: "owns",
      sourceLabel: "Entity",
      sourceId: "11111111-1111-1111-1111-111111111111",
      targetLabel: "Entity",
      targetId: "22222222-2222-2222-2222-222222222222"
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("OWNS");
  });

  it("rejects a non-uuid source id", () => {
    const result = relationshipCreateSchema.safeParse({
      name: "Owns",
      type: "OWNS",
      sourceLabel: "Entity",
      sourceId: "not-a-uuid",
      targetLabel: "Entity",
      targetId: "22222222-2222-2222-2222-222222222222"
    });
    expect(result.success).toBe(false);
  });
});

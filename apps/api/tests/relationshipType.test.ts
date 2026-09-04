import { describe, expect, it } from "vitest";
import { normalizeRelationshipType, relationshipTypeSchema } from "@ontology-builder/shared";

describe("normalizeRelationshipType", () => {
  it("normalizes lower/mixed case with spaces and hyphens", () => {
    expect(normalizeRelationshipType("owns")).toBe("OWNS");
    expect(normalizeRelationshipType("has product")).toBe("HAS_PRODUCT");
    expect(normalizeRelationshipType("governed-by")).toBe("GOVERNED_BY");
  });

  it("strips disallowed characters", () => {
    expect(normalizeRelationshipType("performs!!")).toBe("PERFORMS");
  });

  it("rejects a type that normalizes to nothing usable", () => {
    expect(() => normalizeRelationshipType("123")).toThrow();
    expect(() => normalizeRelationshipType("---")).toThrow();
  });

  it("rejects Cypher injection attempts", () => {
    // A malicious value must never survive normalization into something
    // that could be interpolated into a Cypher relationship type.
    expect(() => normalizeRelationshipType("OWNS]->(m) DETACH DELETE m //")).not.toThrow();
    const normalized = normalizeRelationshipType("OWNS]->(m) DETACH DELETE m //");
    expect(normalized).toMatch(/^[A-Z][A-Z0-9_]*$/);
    expect(normalized).not.toContain(" ");
    expect(normalized).not.toContain("(");
    expect(normalized).not.toContain(")");
  });
});

describe("relationshipTypeSchema", () => {
  it("parses and normalizes via zod", () => {
    const result = relationshipTypeSchema.safeParse("performed");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("PERFORMED");
  });

  it("fails cleanly instead of throwing for unusable input", () => {
    const result = relationshipTypeSchema.safeParse("   ");
    expect(result.success).toBe(false);
  });
});

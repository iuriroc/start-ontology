import { describe, expect, it } from "vitest";
import { RESOURCE_LIST } from "@ontology-builder/shared";
import { RESOURCE_FIELDS } from "../src/features/resourceFields";

// Relationships and Handoffs get their own dedicated pages/forms, so they
// intentionally have no generic RESOURCE_FIELDS entry.
const CUSTOM_PAGE_PATHS = new Set(["relationships", "handoffs"]);

describe("RESOURCE_FIELDS", () => {
  it("has a form config for every generic (non-custom-page) resource", () => {
    for (const resource of RESOURCE_LIST) {
      if (CUSTOM_PAGE_PATHS.has(resource.path)) continue;
      expect(RESOURCE_FIELDS[resource.path], `missing fields for ${resource.path}`).toBeDefined();
      expect(RESOURCE_FIELDS[resource.path]!.length).toBeGreaterThan(0);
    }
  });

  it("every field config has a unique key within its resource", () => {
    for (const [path, fields] of Object.entries(RESOURCE_FIELDS)) {
      const keys = fields.map((f) => f.key);
      expect(new Set(keys).size, `duplicate field key in ${path}`).toBe(keys.length);
    }
  });
});

import { randomUUID } from "node:crypto";
import type { Business, BusinessCreateInput, BusinessUpdateInput } from "@ontology-builder/shared";
import { businessSettingsSchema } from "@ontology-builder/shared";
import { runQuery, type Queryable } from "../postgres/transaction.js";
import { isUuid } from "../postgres/tenantContext.js";

interface BusinessRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function fromRow(row: BusinessRow): Business {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    settings: businessSettingsSchema.parse(row.settings ?? {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return base || "negocio";
}

/** The business registry is control-plane data: it has no RLS and is never
 * filtered by the current business. */
export const businessRepository = {
  async list(client?: Queryable): Promise<Business[]> {
    const r = await runQuery<BusinessRow>(client, `SELECT * FROM businesses ORDER BY created_at ASC`);
    return r.rows.map(fromRow);
  },

  async findById(id: string, client?: Queryable): Promise<Business | null> {
    const r = await runQuery<BusinessRow>(client, `SELECT * FROM businesses WHERE id = $1`, [id]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  },

  /** Accepts the business id (uuid) or its slug. */
  async resolve(ref: string, client?: Queryable): Promise<Business | null> {
    if (isUuid(ref)) return this.findById(ref, client);
    const r = await runQuery<BusinessRow>(client, `SELECT * FROM businesses WHERE slug = $1`, [ref]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  },

  async create(input: BusinessCreateInput, client?: Queryable): Promise<Business> {
    const r = await runQuery<BusinessRow>(
      client,
      `INSERT INTO businesses (id, slug, name, description, settings)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        randomUUID(),
        input.slug ?? slugify(input.name),
        input.name,
        input.description ?? null,
        JSON.stringify(businessSettingsSchema.parse(input.settings ?? {}))
      ]
    );
    return fromRow(r.rows[0]!);
  },

  async update(id: string, input: BusinessUpdateInput, client?: Queryable): Promise<Business | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, value: unknown) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.name !== undefined) add("name", input.name);
    if (input.description !== undefined) add("description", input.description);
    if (input.status !== undefined) add("status", input.status);
    if (input.settings !== undefined) add("settings", JSON.stringify(input.settings));
    add("updated_at", new Date());
    params.push(id);
    const r = await runQuery<BusinessRow>(
      client,
      `UPDATE businesses SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  },

  /** Cascades to every row of the business (ON DELETE CASCADE). Irreversible. */
  async hardDelete(id: string, client?: Queryable): Promise<void> {
    await runQuery(client, `DELETE FROM businesses WHERE id = $1`, [id]);
  }
};

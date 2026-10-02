import type { FastifyInstance } from "fastify";

export const json = (body: string) => JSON.parse(body);

export function tenantClient(app: FastifyInstance, businessId: string) {
  return (opts: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) =>
    app.inject({
      method: opts.method as "GET",
      url: opts.url,
      payload: opts.payload as never,
      headers: { "x-business-id": businessId, ...opts.headers }
    });
}

export async function createBusiness(app: FastifyInstance, name: string) {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await app.inject({ method: "POST", url: "/api/businesses", payload: { name, slug } });
  if (res.statusCode !== 201) throw new Error(`createBusiness failed: ${res.body}`);
  return json(res.body) as { id: string; slug: string };
}

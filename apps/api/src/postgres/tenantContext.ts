import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request state carried through AsyncLocalStorage so repositories never
 * have to thread a businessId argument. The store is a mutable object created
 * synchronously in an onRequest hook; the async preHandler that authenticates
 * the business later fills in `businessId`. */
export interface TenantStore {
  businessId?: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

export function runWithTenant<T>(store: TenantStore, fn: () => T): T {
  return storage.run(store, fn);
}

export function getTenantStore(): TenantStore | undefined {
  return storage.getStore();
}

export function currentBusinessId(): string | undefined {
  return storage.getStore()?.businessId;
}

/** Throws unless a business is in context. Use where code must never run unscoped. */
export function requireBusinessId(): string {
  const id = currentBusinessId();
  if (!id) throw new Error("No business in context");
  return id;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string): boolean => UUID_RE.test(v);

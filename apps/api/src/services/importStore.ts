import { randomUUID } from "node:crypto";
import type { RestorePlan } from "./restoreService.js";

const TTL_MS = 10 * 60 * 1000;

interface Entry {
  plan: RestorePlan;
  businessId: string;
  expiresAt: number;
}

/** Holds a validated-but-not-yet-committed restore plan between
 * POST /api/import (validate) and POST /api/restore (commit), so the user
 * gets a chance to review/confirm mode (merge vs replace) without
 * re-uploading the zip. In-memory only — a single API process is assumed
 * for this MVP; a restart drops any pending import, which is safe since
 * nothing has been written to Postgres yet. */
const pending = new Map<string, Entry>();

export function stagePlan(plan: RestorePlan, businessId: string): string {
  const id = randomUUID();
  pending.set(id, { plan, businessId, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function takePlan(id: string, businessId: string): RestorePlan | undefined {
  const entry = pending.get(id);
  // A plan staged by one business can never be committed by another.
  if (!entry || entry.businessId !== businessId) return undefined;
  if (entry.expiresAt < Date.now()) {
    pending.delete(id);
    return undefined;
  }
  return entry.plan;
}

export function discardPlan(id: string): void {
  pending.delete(id);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pending) {
    if (entry.expiresAt < now) pending.delete(id);
  }
}, 60_000).unref();

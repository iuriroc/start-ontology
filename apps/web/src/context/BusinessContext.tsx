import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Business } from "@ontology-builder/shared";
import { api, getBusinessId, setBusinessId } from "../api/client";

interface BusinessState {
  businesses: Business[];
  current: Business | null;
  loading: boolean;
  select: (id: string) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<BusinessState | null>(null);

/** Holds the list of businesses and the one the whole UI is scoped to. Every
 * request carries it as X-Business-Id; switching remounts the page tree. */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(getBusinessId());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const res = await api.get<{ items: Business[] }>("/businesses");
    setBusinesses(res.items);
    const active = res.items.filter((b) => b.status === "ACTIVE");
    const stored = getBusinessId();
    const valid = active.find((b) => b.id === stored) ?? active[0] ?? null;
    setBusinessId(valid?.id ?? null);
    setCurrentId(valid?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload().catch(() => setLoading(false));
  }, [reload]);

  const select = useCallback((id: string) => {
    setBusinessId(id);
    setCurrentId(id);
  }, []);

  const value = useMemo<BusinessState>(
    () => ({ businesses, current: businesses.find((b) => b.id === currentId) ?? null, loading, select, reload }),
    [businesses, currentId, loading, select, reload]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBusiness(): BusinessState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBusiness must be used inside BusinessProvider");
  return ctx;
}

import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type ListResponse } from "../api/client";

export function useResourceList<T>(path: string, query?: Record<string, string>) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryKey = JSON.stringify(query ?? {});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = query ? new URLSearchParams(query).toString() : "";
      const res = await api.get<ListResponse<T>>(`/${path}${params ? `?${params}` : ""}`);
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, queryKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, total, loading, error, refresh };
}

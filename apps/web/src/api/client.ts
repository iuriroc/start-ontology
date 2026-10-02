const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const STORAGE_KEY = "ontology.businessId";
let currentBusinessId: string | null = null;
try {
  currentBusinessId = localStorage.getItem(STORAGE_KEY);
} catch {
  /* storage unavailable: the provider will pick a business on load */
}

/** The business every tenant-scoped request is sent for (X-Business-Id). */
export function getBusinessId(): string | null {
  return currentBusinessId;
}
export function setBusinessId(id: string | null): void {
  currentBusinessId = id;
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
const tenantHeaders = (): Record<string, string> => (currentBusinessId ? { "X-Business-Id": currentBusinessId } : {});

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}/api${path}`, {
    ...init,
    headers: {
      ...tenantHeaders(),
      ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init?.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code = body?.error?.code ?? "UNKNOWN_ERROR";
    const message = body?.error?.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  baseUrl: BASE_URL,
  /** Downloads a file through fetch so the business header is sent (a plain <a href> cannot). */
  download: async (path: string, fallbackName: string) => {
    const response = await fetch(`${BASE_URL}/api${path}`, { headers: tenantHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(response.status, body?.error?.code ?? "UNKNOWN_ERROR", body?.error?.message ?? "Download failed");
    }
    const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = match?.[1] ?? fallbackName;
    a.click();
    URL.revokeObjectURL(url);
  }
};

export interface ListResponse<T> {
  items: T[];
  total: number;
}

/** Multipart upload for /api/import — bypasses the JSON-only `request`
 * helper since the browser must set its own boundary Content-Type. */
export async function uploadImport<T>(file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${BASE_URL}/api/import`, { method: "POST", body, headers: tenantHeaders() });
  const parsed = await response.json();
  if (!response.ok) {
    throw new ApiError(response.status, parsed?.error?.code ?? "UNKNOWN_ERROR", parsed?.error?.message ?? "Import failed");
  }
  return parsed as T;
}

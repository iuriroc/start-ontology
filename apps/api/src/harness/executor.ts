import type { BusinessSettings, Executor } from "@ontology-builder/shared";

export class ExecutorError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const MAX_RESPONSE_BYTES = 64 * 1024;

/** Header values may use ${ENV:HARNESS_NAME}; only HARNESS_-prefixed variables
 * are readable, so a tool config can never exfiltrate DATABASE_URL & co. */
function resolveHeader(value: string): string {
  return value.replace(/\$\{ENV:([A-Z0-9_]+)\}/g, (_m, name: string) => {
    if (!name.startsWith("HARNESS_")) {
      throw new ExecutorError("ENV_NOT_ALLOWED", `Variável ${name} não é permitida (use o prefixo HARNESS_)`);
    }
    return process.env[name] ?? "";
  });
}

function fillUrl(template: string, args: Record<string, unknown>): { url: URL; consumed: Set<string> } {
  const consumed = new Set<string>();
  const filled = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key: string) => {
    const v = args[key];
    if (v === undefined || v === null) throw new ExecutorError("MISSING_URL_PARAM", `Parâmetro de URL ausente: ${key}`);
    consumed.add(key);
    return encodeURIComponent(String(v));
  });
  return { url: new URL(filled), consumed };
}

export async function executeTool(
  executor: Executor,
  args: Record<string, unknown>,
  settings: BusinessSettings
): Promise<unknown> {
  if (executor.type === "none") return undefined;
  if (executor.type === "mock") return executor.response ?? { ok: true };

  const { url, consumed } = fillUrl(executor.url, args);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ExecutorError("PROTOCOL_NOT_ALLOWED", "Somente http/https");
  }
  if (!settings.allowedHosts.includes(url.host)) {
    throw new ExecutorError("HOST_NOT_ALLOWED", `Host ${url.host} não está em allowedHosts do negócio`);
  }

  const rest = Object.fromEntries(Object.entries(args).filter(([k]) => !consumed.has(k)));
  const hasBody = executor.method !== "GET" && executor.method !== "DELETE";
  if (!hasBody) for (const [k, v] of Object.entries(rest)) url.searchParams.set(k, String(v));

  const headers: Record<string, string> = { Accept: "application/json" };
  if (hasBody) headers["Content-Type"] = "application/json";
  for (const [k, v] of Object.entries(executor.headers ?? {})) headers[k] = resolveHeader(v);

  const response = await fetch(url, {
    method: executor.method,
    headers,
    body: hasBody ? JSON.stringify(rest) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(executor.timeoutMs)
  });
  const text = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep as text */
  }
  if (!response.ok) {
    throw new ExecutorError("UPSTREAM_ERROR", `Sistema respondeu ${response.status}: ${text.slice(0, 300)}`);
  }
  return body;
}

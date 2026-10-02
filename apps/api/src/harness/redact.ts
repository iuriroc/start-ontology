/** Keys always redacted from persisted audit data (LGPD): matched as
 * case-insensitive substrings of the property name. Businesses can add more
 * through settings.sensitiveKeys. */
export const DEFAULT_SENSITIVE_KEYS = [
  "cpf", "cnpj", "password", "senha", "token", "secret", "authorization",
  "card", "cartao", "cartão", "cvv", "pan", "apikey", "api_key"
];

export function redact(value: unknown, extraKeys: string[] = [], depth = 0): unknown {
  const keys = [...DEFAULT_SENSITIVE_KEYS, ...extraKeys].map((k) => k.toLowerCase());
  const walk = (v: unknown, d: number): unknown => {
    if (d > 8) return "[TRUNCATED]";
    if (Array.isArray(v)) return v.map((x) => walk(x, d + 1));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = keys.some((s) => k.toLowerCase().includes(s)) ? "[REDACTED]" : walk(val, d + 1);
      }
      return out;
    }
    return v;
  };
  return walk(value, depth);
}

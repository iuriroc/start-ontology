import { useState } from "react";
import { ApiError } from "../../api/client";

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Erro inesperado");

export interface NamedItem {
  id: string;
  name: string;
}

/** Textarea that edits a JSON value and reports parse errors inline. */
export function JsonField({
  label, value, onChange, rows = 5, hint
}: { label: string; value: unknown; onChange: (v: unknown) => void; rows?: number; hint?: string }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <div className="field">
      <label>{label}</label>
      <textarea
        rows={rows}
        value={text}
        style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
      {bad && <div className="muted" style={{ color: "var(--danger)" }}>JSON inválido</div>}
      {hint && <div className="muted">{hint}</div>}
    </div>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  const cls = decision === "ALLOW" ? "badge-ACTIVE" : decision === "DENY" ? "badge-ERROR" : "badge-WARNING";
  const text = decision === "ALLOW" ? "PERMITIDO" : decision === "DENY" ? "NEGADO" : "ESCALADO";
  return <span className={`badge ${cls}`}>{text}</span>;
}

export const FACTOR_HINT = "ex.: cpf, name, card_last4";

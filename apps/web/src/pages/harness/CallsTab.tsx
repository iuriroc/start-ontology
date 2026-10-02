import { Fragment, useState } from "react";
import { useResourceList } from "../../hooks/useResource";
import { DecisionBadge } from "./shared";

interface Call {
  id: string;
  mode: string;
  agentName: string | null;
  toolName: string;
  decision: string;
  reasons: Array<{ code: string; message: string }>;
  executed: boolean;
  error: string | null;
  handoffId: string | null;
  durationMs: number | null;
  createdAt: string;
  args: unknown;
}

export function CallsTab() {
  const [decision, setDecision] = useState("");
  const [mode, setMode] = useState("");
  const query: Record<string, string> = { limit: "200" };
  if (decision) query.decision = decision;
  if (mode) query.mode = mode;
  const { items, loading, refresh } = useResourceList<Call>("harness/calls", query) as unknown as ReturnType<typeof useResourceList<Call>> & {
    summary?: Record<string, number>;
  };
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <p className="muted">
        Registro imutável de toda decisão do gateway. Dados sensíveis (CPF, cartão, senha, token…) são mascarados antes de gravar; o banco não permite editar nem apagar estas linhas.
      </p>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="">Todas as decisões</option><option value="ALLOW">Permitidas</option><option value="DENY">Negadas</option><option value="ESCALATE">Escaladas</option>
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">Todos os modos</option><option value="LIVE">Reais</option><option value="DRY_RUN">Simulações</option><option value="EVAL">Avaliações</option>
        </select>
        <button className="btn" onClick={() => void refresh()}>Atualizar</button>
      </div>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Quando</th><th>Agente</th><th>Ferramenta</th><th>Decisão</th><th>Motivos</th><th>Modo</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6}>Carregando…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma chamada registrada.</td></tr>}
            {items.map((c) => (
              <Fragment key={c.id}>
                <tr onClick={() => setOpen(open === c.id ? null : c.id)} style={{ cursor: "pointer" }}>
                  <td>{new Date(c.createdAt).toLocaleString()}</td>
                  <td>{c.agentName}</td>
                  <td><code>{c.toolName}</code></td>
                  <td><DecisionBadge decision={c.decision} />{c.executed && " ⚙️"}</td>
                  <td>{c.reasons.map((r) => r.code).join(", ") || "—"}</td>
                  <td>{c.mode}</td>
                </tr>
                {open === c.id && (
                  <tr>
                    <td colSpan={6}>
                      <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>{JSON.stringify({ args: c.args, reasons: c.reasons, error: c.error, handoffId: c.handoffId, durationMs: c.durationMs }, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

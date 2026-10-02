import { useState } from "react";
import { api } from "../../api/client";
import { useResourceList } from "../../hooks/useResource";
import { JsonField, errMsg, type NamedItem } from "./shared";

interface EvalCase { id: string; name: string; toolName: string; expectedDecision: string; expectedReason: string | null; agentId: string | null }
interface Run { id: string; total: number; passed: number; failed: number; createdAt: string; results: Array<{ caseId: string; name: string; passed: boolean; expected: { decision: string; reason?: string | null }; actual: { decision: string; reasons: string[] } }> }

export function EvalsTab() {
  const cases = useResourceList<EvalCase>("harness/eval-cases");
  const runs = useResourceList<Run>("harness/eval-runs");
  const agents = useResourceList<NamedItem>("harness/agents");
  const tools = useResourceList<{ id: string; name: string }>("harness/tools");
  const [form, setForm] = useState({ name: "", agentId: "", toolName: "", expectedDecision: "DENY", expectedReason: "" });
  const [args, setArgs] = useState<unknown>({});
  const [context, setContext] = useState<unknown>({});
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/harness/eval-cases", {
        name: form.name, agentId: form.agentId || undefined, toolName: form.toolName,
        expectedDecision: form.expectedDecision, expectedReason: form.expectedReason || undefined, args, context
      });
      setForm({ ...form, name: "" });
      await cases.refresh();
    } catch (err) { setError(errMsg(err)); }
  };
  const run = async () => {
    setRunning(true);
    try { await api.post("/harness/eval-runs"); await runs.refresh(); } catch (err) { setError(errMsg(err)); } finally { setRunning(false); }
  };
  const remove = async (c: EvalCase) => { await api.delete(`/harness/eval-cases/${c.id}`); await cases.refresh(); };
  const last = runs.items[0];

  return (
    <div>
      <p className="muted">
        Casos de teste que o gateway precisa cumprir antes de ir para produção (ex.: "o N1 nunca executa reembolso"). Rodam no modo avaliação: só decisão, nada é executado.
        Rode de novo sempre que mexer em Habilidades, ferramentas ou guardrails.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <button className="btn btn-primary" disabled={running || cases.items.length === 0} onClick={() => void run()}>{running ? "Rodando…" : "Rodar avaliação"}</button>
        {last && <span className={`badge ${last.failed === 0 ? "badge-ACTIVE" : "badge-ERROR"}`}>{last.passed}/{last.total} passaram · {new Date(last.createdAt).toLocaleString()}</span>}
      </div>
      {last && last.failed > 0 && (
        <div className="banner banner-error">
          <strong>Falhas na última execução:</strong>
          <ul>{last.results.filter((r) => !r.passed).map((r) => <li key={r.caseId}>{r.name}: esperado {r.expected.decision}{r.expected.reason ? ` (${r.expected.reason})` : ""}, obtido {r.actual.decision} [{r.actual.reasons.join(", ")}]</li>)}</ul>
        </div>
      )}
      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <form onSubmit={create}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 14 }}>
            <div className="field"><label>Nome do caso</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Agente</label>
              <select value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}><option value="">—</option>{agents.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field"><label>Ferramenta</label>
              <select value={form.toolName} onChange={(e) => setForm({ ...form, toolName: e.target.value })}><option value="">—</option>{tools.items.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</select></div>
            <div className="field"><label>Esperado</label>
              <select value={form.expectedDecision} onChange={(e) => setForm({ ...form, expectedDecision: e.target.value })}><option value="ALLOW">Permitir</option><option value="DENY">Negar</option><option value="ESCALATE">Escalar</option></select></div>
            <div className="field"><label>Motivo (opcional)</label><input type="text" placeholder="VERIFICATION_REQUIRED" value={form.expectedReason} onChange={(e) => setForm({ ...form, expectedReason: e.target.value })} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <JsonField label="Argumentos" value={args} onChange={setArgs} rows={4} />
            <JsonField label="Contexto do runtime" value={context} onChange={setContext} rows={4} hint='ex.: {"verifiedFactors":["cpf","name","card_last4"]}' />
          </div>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-actions"><button className="btn btn-primary" type="submit">Adicionar caso</button></div>
        </form>
      </div>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Caso</th><th>Ferramenta</th><th>Esperado</th><th></th></tr></thead>
          <tbody>
            {cases.items.length === 0 && <tr><td colSpan={4} className="muted">Nenhum caso ainda.</td></tr>}
            {cases.items.map((c) => (
              <tr key={c.id}><td>{c.name}</td><td><code>{c.toolName}</code></td><td>{c.expectedDecision}{c.expectedReason ? ` · ${c.expectedReason}` : ""}</td>
                <td style={{ textAlign: "right" }}><button className="btn btn-danger" onClick={() => void remove(c)}>Excluir</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

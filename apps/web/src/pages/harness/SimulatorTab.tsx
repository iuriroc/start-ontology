import { useState } from "react";
import { api } from "../../api/client";
import { useResourceList } from "../../hooks/useResource";
import { DecisionBadge, JsonField, errMsg, type NamedItem } from "./shared";

interface Result {
  decision: string;
  reasons: Array<{ code: string; message: string }>;
  evaluated: Array<{ name: string; kind: string; outcome: string }>;
}

export function SimulatorTab() {
  const agents = useResourceList<NamedItem>("harness/agents");
  const tools = useResourceList<{ id: string; name: string }>("harness/tools");
  const [agent, setAgent] = useState("");
  const [tool, setTool] = useState("");
  const [args, setArgs] = useState<unknown>({ orderId: "123", amount: 100 });
  const [context, setContext] = useState<unknown>({ verifiedFactors: ["cpf", "name", "card_last4"] });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<Result>("/harness/simulate", { agent, tool, args, context }));
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <div>
      <p className="muted">
        Teste uma chamada sem risco: passa pelo mesmo avaliador do gateway, é registrada na auditoria como simulação e <strong>nunca executa nada</strong>.
        No contexto, informe como se fosse o runtime: <code>verifiedFactors</code> (fatores confirmados) e <code>approval</code>.
      </p>
      <div className="panel" style={{ padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="field">
            <label>Agente</label>
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="">Escolha…</option>
              {agents.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Ferramenta</label>
            <select value={tool} onChange={(e) => setTool(e.target.value)}>
              <option value="">Escolha…</option>
              {tools.items.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <JsonField label="Argumentos" value={args} onChange={setArgs} rows={6} />
          <JsonField label="Contexto do runtime" value={context} onChange={setContext} rows={6} />
        </div>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="form-actions"><button className="btn btn-primary" disabled={!agent || !tool} onClick={() => void run()}>Simular</button></div>
      </div>
      {result && (
        <div className="panel" style={{ padding: 18, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Resultado: <DecisionBadge decision={result.decision} /></h3>
          {result.reasons.length === 0 ? <p className="muted">Nenhuma objeção.</p> : (
            <ul>{result.reasons.map((r, i) => <li key={i}><code>{r.code}</code> — {r.message}</li>)}</ul>
          )}
          {result.evaluated.length > 0 && (
            <>
              <div className="muted">Guardrails avaliados</div>
              <ul>{result.evaluated.map((g, i) => <li key={i}>{g.name} ({g.kind}): {g.outcome}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

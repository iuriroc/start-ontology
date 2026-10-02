import { useState } from "react";
import { api } from "../../api/client";
import { useResourceList } from "../../hooks/useResource";
import { JsonField, errMsg, type NamedItem } from "./shared";

interface Guardrail {
  id: string;
  name: string;
  kind: string;
  appliesTo: { tools?: string[]; agents?: string[]; riskTiers?: string[] };
  config: Record<string, unknown>;
  priority: number;
  status: string;
}

const KINDS: Record<string, { label: string; help: string; config: unknown }> = {
  REQUIRE_VERIFICATION: {
    label: "Exigir pré-verificação",
    help: "Nega a chamada se o runtime não confirmou todos os fatores (ex.: 3 fatores LGPD).",
    config: { factors: ["cpf", "name", "card_last4"] }
  },
  DENY: { label: "Bloquear sempre", help: "Nunca permite as chamadas que casarem com o escopo.", config: { reason: "Somente humano executa" } },
  LIMIT: {
    label: "Limite de valor",
    help: "Acima do limite, nega ou escala para um agente (ex.: humano).",
    config: { param: "amount", max: 500, onExceed: "ESCALATE" }
  },
  REQUIRE_APPROVAL: { label: "Exigir aprovação humana", help: "Escala sempre, a menos que o runtime informe uma aprovação.", config: {} }
};

export function GuardrailsTab() {
  const list = useResourceList<Guardrail>("harness/guardrails");
  const tools = useResourceList<{ id: string; name: string }>("harness/tools");
  const agents = useResourceList<NamedItem>("harness/agents");
  const [form, setForm] = useState({ name: "", kind: "REQUIRE_VERIFICATION", priority: "0", toolsScope: [] as string[] });
  const [config, setConfig] = useState<unknown>(KINDS.REQUIRE_VERIFICATION!.config);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const agentName = (id: string) => agents.items.find((a) => a.id === id)?.name ?? id.slice(0, 8);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/harness/guardrails", {
        name: form.name,
        kind: form.kind,
        priority: Number(form.priority) || 0,
        appliesTo: form.toolsScope.length ? { tools: form.toolsScope } : {},
        config
      });
      setForm({ ...form, name: "" });
      await list.refresh();
    } catch (err) {
      setError(errMsg(err));
    }
  };
  const toggle = async (g: Guardrail) => {
    await api.put(`/harness/guardrails/${g.id}`, { status: g.status === "ACTIVE" ? "DISABLED" : "ACTIVE" });
    await list.refresh();
  };
  const remove = async (g: Guardrail) => {
    await api.delete(`/harness/guardrails/${g.id}`);
    await list.refresh();
  };

  return (
    <div>
      <p className="muted">
        Guardrails são regras que o gateway <strong>aplica de verdade</strong> a cada chamada do agente. Diretrizes (Policy) continuam sendo o texto; aqui é o que bloqueia.
        Regra geral: negar vence escalar, que vence permitir. Sem a Habilidade ligada ao agente, a chamada é sempre negada.
      </p>
      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <form onSubmit={create}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 14 }}>
            <div className="field"><label>Nome</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field">
              <label>Tipo</label>
              <select
                value={form.kind}
                onChange={(e) => {
                  setForm({ ...form, kind: e.target.value });
                  setConfig(KINDS[e.target.value]!.config);
                  setFormKey((k) => k + 1);
                }}
              >
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <div className="muted">{KINDS[form.kind]!.help}</div>
            </div>
            <div className="field"><label>Prioridade</label><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></div>
          </div>
          <div className="field">
            <label>Vale para as ferramentas (vazio = todas)</label>
            <select multiple size={4} value={form.toolsScope} onChange={(e) => setForm({ ...form, toolsScope: [...e.target.selectedOptions].map((o) => o.value) })}>
              {tools.items.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <JsonField key={formKey} label="Configuração" value={config} onChange={setConfig} rows={5}
            hint={form.kind === "LIMIT" ? 'Para escalar a um agente: inclua "escalateToAgentId": "<id do agente>" (veja os ids em Agentes).' : undefined} />
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-actions"><button className="btn btn-primary" type="submit">Criar guardrail</button></div>
        </form>
      </div>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Guardrail</th><th>Tipo</th><th>Escopo</th><th>Configuração</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.items.length === 0 && <tr><td colSpan={6} className="muted">Nenhum guardrail ainda. Sem guardrails, só a Habilidade e o contrato da ferramenta protegem o agente.</td></tr>}
            {list.items.map((g) => (
              <tr key={g.id}>
                <td>{g.name}<div className="muted">prioridade {g.priority}</div></td>
                <td>{KINDS[g.kind]?.label ?? g.kind}</td>
                <td>{g.appliesTo.tools?.join(", ") || "todas"}{g.appliesTo.agents?.length ? ` · agentes: ${g.appliesTo.agents.map(agentName).join(", ")}` : ""}</td>
                <td><code style={{ fontSize: 11.5 }}>{JSON.stringify(g.config)}</code></td>
                <td><span className={`badge badge-${g.status === "ACTIVE" ? "ACTIVE" : "ARCHIVED"}`}>{g.status === "ACTIVE" ? "ATIVO" : "DESATIVADO"}</span></td>
                <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => void toggle(g)}>{g.status === "ACTIVE" ? "Desativar" : "Ativar"}</button>
                  <button className="btn btn-danger" onClick={() => void remove(g)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

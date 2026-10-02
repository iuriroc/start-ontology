import { useState } from "react";
import { api } from "../../api/client";
import { useResourceList } from "../../hooks/useResource";
import { JsonField, errMsg, type NamedItem } from "./shared";

interface Tool {
  id: string;
  name: string;
  capabilityId: string;
  capabilityName?: string;
  description: string | null;
  riskTier: string;
  executor: { type: string };
  status: string;
}

const EXECUTOR_EXAMPLE = { type: "mock", response: { ok: true } };
const SCHEMA_EXAMPLE = { type: "object", properties: { orderId: { type: "string" }, amount: { type: "number" } }, required: ["orderId"] };

export function ToolsTab() {
  const tools = useResourceList<Tool>("harness/tools");
  const caps = useResourceList<NamedItem>("capabilities", { limit: "500" });
  const [form, setForm] = useState({ name: "", capabilityId: "", description: "", riskTier: "LOW" });
  const [executor, setExecutor] = useState<unknown>(EXECUTOR_EXAMPLE);
  const [schema, setSchema] = useState<unknown>(SCHEMA_EXAMPLE);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/harness/tools", { ...form, inputSchema: schema, executor, description: form.description || undefined });
      setForm({ name: "", capabilityId: "", description: "", riskTier: "LOW" });
      await tools.refresh();
    } catch (err) {
      setError(errMsg(err));
    }
  };
  const toggle = async (t: Tool) => {
    await api.put(`/harness/tools/${t.id}`, { status: t.status === "ACTIVE" ? "DISABLED" : "ACTIVE" });
    await tools.refresh();
  };
  const remove = async (t: Tool) => {
    await api.delete(`/harness/tools/${t.id}`);
    await tools.refresh();
  };

  return (
    <div>
      <p className="muted">
        Uma ferramenta é o contrato de algo que o agente pode pedir ao sistema. Ela fica ligada a uma Habilidade; o agente só a usa se tiver a conexão{" "}
        <code>HAS_CAPABILITY</code> para essa Habilidade.
      </p>
      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <form onSubmit={create}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div className="field"><label>Nome (ex.: refund.request)</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field">
              <label>Habilidade</label>
              <select value={form.capabilityId} onChange={(e) => setForm({ ...form, capabilityId: e.target.value })}>
                <option value="">Escolha…</option>
                {caps.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Risco</label>
              <select value={form.riskTier} onChange={(e) => setForm({ ...form, riskTier: e.target.value })}>
                <option>LOW</option><option>MEDIUM</option><option>HIGH</option>
              </select>
            </div>
          </div>
          <div className="field"><label>Descrição</label><input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <JsonField label="Contrato de entrada (JSON Schema)" value={schema} onChange={setSchema} rows={7} />
            <JsonField
              label="Executor"
              value={executor}
              onChange={setExecutor}
              rows={7}
              hint='none = só autoriza | mock = resposta fixa | http = {"type":"http","method":"POST","url":"https://host/{orderId}"} (host precisa estar liberado no negócio)'
            />
          </div>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-actions"><button className="btn btn-primary" type="submit">Criar ferramenta</button></div>
        </form>
      </div>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Ferramenta</th><th>Habilidade</th><th>Risco</th><th>Executor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {tools.items.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma ferramenta ainda.</td></tr>}
            {tools.items.map((t) => (
              <tr key={t.id}>
                <td><code>{t.name}</code><div className="muted">{t.description}</div></td>
                <td>{t.capabilityName}</td>
                <td>{t.riskTier}</td>
                <td>{t.executor.type}</td>
                <td><span className={`badge badge-${t.status === "ACTIVE" ? "ACTIVE" : "ARCHIVED"}`}>{t.status === "ACTIVE" ? "ATIVA" : "DESATIVADA"}</span></td>
                <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => void toggle(t)}>{t.status === "ACTIVE" ? "Desativar" : "Ativar"}</button>
                  <button className="btn btn-danger" onClick={() => void remove(t)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

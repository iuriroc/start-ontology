import { useEffect, useState } from "react";
import { businessCreateSchema, type Business } from "@ontology-builder/shared";
import { ApiError, api } from "../api/client";
import { HelpPanel } from "../components/HelpPanel";
import { StatusBadge } from "../components/StatusBadge";
import { useBusiness } from "../context/BusinessContext";

interface Summary {
  nodes: number;
  tools: number;
  guardrails: number;
  calls: number;
}

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Erro inesperado");

export function BusinessesPage() {
  const { businesses, current, select, reload } = useBusiness();
  const [form, setForm] = useState({ name: "", slug: "", description: "", cloneFrom: "" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [editing, setEditing] = useState<Business | null>(null);
  const [hostsText, setHostsText] = useState("");

  useEffect(() => {
    void Promise.all(
      businesses.map(async (b) => [b.id, await api.get<Summary>(`/businesses/${b.id}/summary`)] as const)
    )
      .then((rows) => setSummaries(Object.fromEntries(rows)))
      .catch(() => undefined);
  }, [businesses]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const parsed = businessCreateSchema.safeParse({
      name: form.name,
      slug: form.slug || undefined,
      description: form.description || undefined
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    try {
      const created = await api.post<Business>("/businesses", parsed.data);
      if (form.cloneFrom) {
        const r = await api.post<{ copied: Record<string, number> }>(`/businesses/${created.id}/clone`, {
          sourceBusinessId: form.cloneFrom
        });
        setInfo(`Negócio criado a partir do modelo: ${JSON.stringify(r.copied)}`);
      }
      setForm({ name: "", slug: "", description: "", cloneFrom: "" });
      await reload();
      select(created.id);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const setStatus = async (b: Business, status: "ACTIVE" | "ARCHIVED") => {
    setError(null);
    try {
      await api.put(`/businesses/${b.id}`, { status });
      await reload();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const hardDelete = async (b: Business) => {
    const typed = window.prompt(
      `Apagar DEFINITIVAMENTE "${b.name}" e tudo que pertence a ele (ontologia, ferramentas, auditoria, chaves).\nDigite o slug "${b.slug}" para confirmar:`
    );
    if (typed !== b.slug) return;
    try {
      await api.delete(`/businesses/${b.id}?hard=true&confirmSlug=${encodeURIComponent(typed)}`);
      await reload();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const startEdit = (b: Business) => {
    setEditing(b);
    setHostsText(b.settings.allowedHosts.join("\n"));
  };
  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.put(`/businesses/${editing.id}`, {
        name: editing.name,
        description: editing.description ?? undefined,
        settings: {
          ...editing.settings,
          allowedHosts: hostsText.split("\n").map((h) => h.trim()).filter(Boolean)
        }
      });
      setEditing(null);
      await reload();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>🏢 Negócios</h2>
      </div>
      <HelpPanel
        title='O que é um "Negócio"?'
        text="Cada negócio é um espaço totalmente separado: tem a sua própria ontologia, ferramentas, guardrails, auditoria e chaves de acesso do agente. Nada de um negócio aparece em outro — o isolamento é garantido pelo banco de dados."
        example="Ex.: Greenn Pagamentos, NimbusPay, uma operação nova copiada de um modelo"
      />

      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <form onSubmit={create}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 14 }}>
            <div className="field">
              <label>Nome</label>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field">
              <label>Slug (opcional)</label>
              <input type="text" placeholder="gerado do nome" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <div className="field">
              <label>Copiar ontologia + harness de…</label>
              <select value={form.cloneFrom} onChange={(e) => setForm((f) => ({ ...f, cloneFrom: e.target.value }))}>
                <option value="">Começar vazio</option>
                {businesses.filter((b) => b.status === "ACTIVE").map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Descrição</label>
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          {error && <div className="banner banner-error">{error}</div>}
          {info && <div className="banner banner-info">{info}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Criar negócio</button>
          </div>
        </form>
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr><th>Negócio</th><th>Status</th><th>Elementos</th><th>Ferramentas</th><th>Guardrails</th><th>Chamadas</th><th></th></tr>
          </thead>
          <tbody>
            {businesses.map((b) => {
              const s = summaries[b.id];
              return (
                <tr key={b.id}>
                  <td>
                    <strong>{b.name}</strong> {current?.id === b.id && <span className="badge badge-ACTIVE">em uso</span>}
                    <div className="muted">{b.slug}</div>
                  </td>
                  <td><StatusBadge status={b.status} /></td>
                  <td>{s?.nodes ?? "…"}</td>
                  <td>{s?.tools ?? "…"}</td>
                  <td>{s?.guardrails ?? "…"}</td>
                  <td>{s?.calls ?? "…"}</td>
                  <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {b.status === "ACTIVE" && current?.id !== b.id && <button className="btn" onClick={() => select(b.id)}>Usar</button>}
                    <button className="btn" onClick={() => startEdit(b)}>Configurar</button>
                    {b.status === "ACTIVE" ? (
                      <button className="btn" onClick={() => void setStatus(b, "ARCHIVED")}>Arquivar</button>
                    ) : (
                      <button className="btn" onClick={() => void setStatus(b, "ACTIVE")}>Reativar</button>
                    )}
                    {b.status === "ARCHIVED" && <button className="btn btn-danger" onClick={() => void hardDelete(b)}>Apagar</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="panel" style={{ padding: 18, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Configurar {editing.name}</h3>
          <div className="field">
            <label>Nome</label>
            <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Hosts que o gateway pode chamar (um por linha, host:porta)</label>
            <textarea rows={4} value={hostsText} onChange={(e) => setHostsText(e.target.value)} placeholder="api.minhaempresa.com.br&#10;localhost:3100" />
            <div className="muted">Ferramentas do tipo HTTP só funcionam para hosts desta lista. Vazio = nenhuma chamada externa.</div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => void saveEdit()}>Salvar</button>
            <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

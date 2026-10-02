import { useState } from "react";
import { api } from "../../api/client";
import { useResourceList } from "../../hooks/useResource";
import { errMsg } from "./shared";

interface Key { id: string; name: string; prefix: string; createdAt: string; revokedAt: string | null }
interface Bundle { id: string; checksum: string; createdAt: string }

export function RuntimeTab() {
  const keys = useResourceList<Key>("harness/api-keys");
  const bundles = useResourceList<Bundle>("harness/bundles");
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.post<{ key: string }>("/harness/api-keys", { name });
      setNewKey(r.key);
      setName("");
      await keys.refresh();
    } catch (err) { setError(errMsg(err)); }
  };
  const revoke = async (k: Key) => { await api.delete(`/harness/api-keys/${k.id}`); await keys.refresh(); };
  const compile = async () => {
    setError(null);
    try { setPreview(JSON.stringify(await api.get("/harness/compile"), null, 2)); } catch (err) { setError(errMsg(err)); }
  };
  const publish = async () => {
    setError(null);
    try { await api.post("/harness/bundles", {}); await bundles.refresh(); } catch (err) { setError(errMsg(err)); }
  };

  return (
    <div>
      <h3>Bundle compilado</h3>
      <p className="muted">
        O bundle é o pacote que o runtime do agente carrega: cadastros, regras, agentes com as ferramentas que realmente possuem e guardrails. Só entram elementos ATIVOS.
        Detalhes de execução (URLs, headers) nunca vão para o bundle. Publique para fixar uma versão que o runtime busca em <code>GET /api/gateway/bundle</code>.
      </p>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button className="btn" onClick={() => void compile()}>Pré-visualizar</button>
        <button className="btn btn-primary" onClick={() => void publish()}>Publicar bundle</button>
      </div>
      {error && <div className="banner banner-error">{error}</div>}
      {preview && <pre className="panel" style={{ padding: 14, maxHeight: 320, overflow: "auto", fontSize: 12 }}>{preview}</pre>}
      <div className="panel" style={{ marginBottom: 28 }}>
        <table>
          <thead><tr><th>Publicado em</th><th>Checksum</th></tr></thead>
          <tbody>
            {bundles.items.length === 0 && <tr><td colSpan={2} className="muted">Nenhum bundle publicado.</td></tr>}
            {bundles.items.map((b) => <tr key={b.id}><td>{new Date(b.createdAt).toLocaleString()}</td><td><code>{b.checksum.slice(0, 16)}…</code></td></tr>)}
          </tbody>
        </table>
      </div>

      <h3>Chaves do runtime</h3>
      <p className="muted">
        Cada chave pertence a este negócio: o runtime (Paperclip, n8n…) envia <code>Authorization: Bearer &lt;chave&gt;</code> para <code>/api/gateway/authorize</code> ou <code>/api/gateway/execute</code> e só consegue agir aqui dentro.
      </p>
      <form onSubmit={createKey} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <input type="text" placeholder="Nome (ex.: paperclip-producao)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>Gerar chave</button>
      </form>
      {newKey && (
        <div className="banner banner-warning">
          Copie agora — não será exibida novamente:<br /><code style={{ wordBreak: "break-all" }}>{newKey}</code>
        </div>
      )}
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Nome</th><th>Prefixo</th><th>Criada</th><th></th></tr></thead>
          <tbody>
            {keys.items.length === 0 && <tr><td colSpan={4} className="muted">Nenhuma chave.</td></tr>}
            {keys.items.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td><td><code>{k.prefix}…</code></td><td>{new Date(k.createdAt).toLocaleString()}</td>
                <td style={{ textAlign: "right" }}>{k.revokedAt ? <span className="badge badge-ARCHIVED">REVOGADA</span> : <button className="btn btn-danger" onClick={() => void revoke(k)}>Revogar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { NavLink } from "react-router-dom";
import { RESOURCE_GROUPS, RESOURCE_LIST } from "@ontology-builder/shared";
import { useBusiness } from "../context/BusinessContext";

const HARNESS_TABS = [
  { path: "tools", icon: "🧰", label: "Ferramentas" },
  { path: "guardrails", icon: "🚧", label: "Guardrails" },
  { path: "simulator", icon: "🧪", label: "Simulador" },
  { path: "calls", icon: "📜", label: "Auditoria" },
  { path: "evals", icon: "✅", label: "Avaliação" },
  { path: "runtime", icon: "🔌", label: "Bundle & Chaves" }
];

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined);

export function Sidebar() {
  const { businesses, current, select } = useBusiness();
  const active = businesses.filter((b) => b.status === "ACTIVE");
  return (
    <nav className="sidebar">
      <h1>Ontology Builder</h1>

      <div className="section-label">Negócio</div>
      <div style={{ padding: "0 8px 8px" }}>
        <select
          aria-label="Negócio ativo"
          value={current?.id ?? ""}
          onChange={(e) => select(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--panel-solid)", color: "var(--text)", border: "1px solid var(--border)" }}
        >
          {active.length === 0 && <option value="">Nenhum negócio ativo</option>}
          {active.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <NavLink to="/businesses" className={navLinkClass}>
        <span className="nav-icon">🏢</span> Gerenciar negócios
      </NavLink>

      <div className="section-label">Studio</div>
      <NavLink to="/" end className={navLinkClass}>
        <span className="nav-icon">📊</span> Visão Geral
      </NavLink>
      <NavLink to="/graph" className={navLinkClass}>
        <span className="nav-icon">🕸️</span> Graph Studio
      </NavLink>
      <NavLink to="/wizard" className={navLinkClass}>
        <span className="nav-icon">🪄</span> Assistente Guiado
      </NavLink>

      {RESOURCE_GROUPS.map((group) => (
        <div key={group}>
          <div className="section-label">{group}</div>
          {RESOURCE_LIST.filter((r) => r.group === group).map((r) => (
            <NavLink key={r.key} to={`/ontology/${r.path}`} className={navLinkClass}>
              <span className="nav-icon">{r.icon}</span> {r.displayName}
              <span className="nav-dot" style={{ background: r.color }} />
            </NavLink>
          ))}
        </div>
      ))}

      <div className="section-label">Harness do Agente</div>
      {HARNESS_TABS.map((t) => (
        <NavLink key={t.path} to={`/harness/${t.path}`} className={navLinkClass}>
          <span className="nav-icon">{t.icon}</span> {t.label}
        </NavLink>
      ))}

      <div className="section-label">Versões &amp; Dados</div>
      <NavLink to="/versions" className={navLinkClass}>
        <span className="nav-icon">🏷️</span> Histórico
      </NavLink>
      <NavLink to="/backup" className={navLinkClass}>
        <span className="nav-icon">💾</span> Cópias de Segurança
      </NavLink>
    </nav>
  );
}

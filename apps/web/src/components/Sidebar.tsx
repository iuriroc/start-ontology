import { NavLink } from "react-router-dom";
import { RESOURCE_GROUPS, RESOURCE_LIST } from "@ontology-builder/shared";

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined);

export function Sidebar() {
  return (
    <nav className="sidebar">
      <h1>Ontology Builder</h1>

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

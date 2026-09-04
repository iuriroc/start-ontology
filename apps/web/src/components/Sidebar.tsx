import { NavLink } from "react-router-dom";
import { RESOURCE_LIST } from "@ontology-builder/shared";

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined);

export function Sidebar() {
  return (
    <nav className="sidebar">
      <h1>Ontology Builder</h1>

      <NavLink to="/" end className={navLinkClass}>
        Visão Geral
      </NavLink>

      <div className="section-label">Organização</div>
      {RESOURCE_LIST.map((r) => (
        <NavLink key={r.key} to={`/ontology/${r.path}`} className={navLinkClass}>
          {r.displayName}
        </NavLink>
      ))}

      <div className="section-label">Visualização</div>
      <NavLink to="/graph" className={navLinkClass}>
        Mapa Visual
      </NavLink>

      <div className="section-label">Controle</div>
      <NavLink to="/versions" className={navLinkClass}>
        Histórico
      </NavLink>
      <NavLink to="/backup" className={navLinkClass}>
        Cópias de Segurança
      </NavLink>
    </nav>
  );
}

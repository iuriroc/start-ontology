import { Link, Outlet, useLocation } from "react-router-dom";
import { useBusiness } from "../context/BusinessContext";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const { current, loading } = useBusiness();
  const onBusinesses = useLocation().pathname.startsWith("/businesses");
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        {/* key = business id: switching business remounts every page so no data of the previous one lingers */}
        {onBusinesses ? (
          <Outlet />
        ) : loading ? (
          <p className="muted">Carregando negócios…</p>
        ) : current ? (
          <Outlet key={current.id} />
        ) : (
          <div className="banner banner-warning">
            Nenhum negócio ativo. <Link to="/businesses">Crie ou reative um negócio</Link> para começar.
          </div>
        )}
      </main>
    </div>
  );
}

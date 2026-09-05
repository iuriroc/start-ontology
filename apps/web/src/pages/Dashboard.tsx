import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RESOURCE_LIST } from "@ontology-builder/shared";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";

interface StatsResponse {
  counts: Record<string, number>;
  currentVersion: string | null;
}

interface ValidationIssue {
  severity: "WARNING" | "ERROR";
  code: string;
  message: string;
}

interface ValidationResponse {
  status: "VALID" | "WARNING" | "ERROR";
  issues: ValidationIssue[];
}

const LABEL_META: Record<string, { name: string; icon: string }> = Object.fromEntries(
  RESOURCE_LIST.map((r) => [r.label, { name: r.displayName, icon: r.icon }])
);
LABEL_META.OntologyVersion = { name: "Versões", icon: "🏷️" };

/** Section 44: counts + current version + on-demand structural validation. */
export function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StatsResponse>("/ontology")
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar as estatísticas"));
  }, []);

  const runValidation = async () => {
    setValidating(true);
    try {
      const result = await api.get<ValidationResponse>("/ontology/validate");
      setValidation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível validar a ontologia");
    } finally {
      setValidating(false);
    }
  };

  const isEmpty = stats ? Object.values(stats.counts).every((c) => c === 0) : false;

  return (
    <div>
      <div className="page-header">
        <h2>📊 Visão Geral</h2>
        <button className="btn btn-primary" onClick={() => void runValidation()} disabled={validating}>
          {validating ? "Validando…" : "Validar Ontologia"}
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {isEmpty && (
        <div className="banner banner-info" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Sua ontologia ainda está vazia. Que tal um tour rápido para criar o primeiro cadastro e a primeira conexão?</span>
          <Link to="/wizard" className="btn btn-primary" style={{ textDecoration: "none", marginLeft: 14 }}>
            🪄 Começar tour guiado
          </Link>
        </div>
      )}

      <div className="stat-grid">
        {stats &&
          Object.entries(stats.counts).map(([label, count]) => (
            <div className="stat-card" key={label}>
              <div className="value">{count}</div>
              <div className="label">
                {LABEL_META[label]?.icon} {LABEL_META[label]?.name ?? label}
              </div>
            </div>
          ))}
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <p>
          <strong>Versão atual da ontologia:</strong> {stats?.currentVersion ?? "nenhuma ainda"}
        </p>
      </div>

      {validation && (
        <div className="panel" style={{ padding: 18 }}>
          <p>
            <strong>Status:</strong> <StatusBadge status={validation.status} />
          </p>
          {validation.issues.length === 0 && <p className="muted">Nenhum problema estrutural encontrado.</p>}
          {validation.issues.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Gravidade</th>
                  <th>Código</th>
                  <th>Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {validation.issues.map((issue, i) => (
                  <tr key={i}>
                    <td>
                      <StatusBadge status={issue.severity} />
                    </td>
                    <td>
                      <code>{issue.code}</code>
                    </td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

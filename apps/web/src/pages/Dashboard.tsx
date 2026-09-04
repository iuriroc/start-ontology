import { useEffect, useState } from "react";
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

const LABEL_DISPLAY: Record<string, string> = {
  Entity: "Entities",
  Concept: "Concepts",
  RelationshipDefinition: "Relationships",
  Rule: "Rules",
  State: "States",
  Capability: "Capabilities",
  Agent: "Agents",
  Policy: "Policies",
  Issue: "Issues",
  Handoff: "Handoffs",
  Decision: "Decisions",
  Execution: "Executions",
  LearningEvent: "Learning Events",
  OntologyVersion: "Versions"
};

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
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load stats"));
  }, []);

  const runValidation = async () => {
    setValidating(true);
    try {
      const result = await api.get<ValidationResponse>("/ontology/validate");
      setValidation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <button className="btn btn-primary" onClick={() => void runValidation()} disabled={validating}>
          {validating ? "Validating…" : "Validate Ontology"}
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="stat-grid">
        {stats &&
          Object.entries(stats.counts).map(([label, count]) => (
            <div className="stat-card" key={label}>
              <div className="value">{count}</div>
              <div className="label">{LABEL_DISPLAY[label] ?? label}</div>
            </div>
          ))}
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <p>
          <strong>Ontology Version:</strong> {stats?.currentVersion ?? "none yet"}
        </p>
      </div>

      {validation && (
        <div className="panel" style={{ padding: 18 }}>
          <p>
            <strong>Status:</strong> <StatusBadge status={validation.status} />
          </p>
          {validation.issues.length === 0 && <p className="muted">No structural issues found.</p>}
          {validation.issues.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Code</th>
                  <th>Message</th>
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

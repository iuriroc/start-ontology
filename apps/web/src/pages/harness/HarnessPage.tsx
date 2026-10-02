import { Navigate, useParams } from "react-router-dom";
import { useBusiness } from "../../context/BusinessContext";
import { CallsTab } from "./CallsTab";
import { EvalsTab } from "./EvalsTab";
import { GuardrailsTab } from "./GuardrailsTab";
import { RuntimeTab } from "./RuntimeTab";
import { SimulatorTab } from "./SimulatorTab";
import { ToolsTab } from "./ToolsTab";

const TABS = {
  tools: { title: "🧰 Ferramentas", Component: ToolsTab },
  guardrails: { title: "🚧 Guardrails", Component: GuardrailsTab },
  simulator: { title: "🧪 Simulador", Component: SimulatorTab },
  calls: { title: "📜 Auditoria de chamadas", Component: CallsTab },
  evals: { title: "✅ Avaliação", Component: EvalsTab },
  runtime: { title: "🔌 Bundle & Chaves", Component: RuntimeTab }
} as const;

export function HarnessPage() {
  const { tab } = useParams();
  const { current } = useBusiness();
  const entry = TABS[tab as keyof typeof TABS];
  if (!entry) return <Navigate to="/harness/tools" replace />;
  const { title, Component } = entry;
  return (
    <div>
      <div className="page-header">
        <h2>{title}</h2>
        <span className="muted">Negócio: {current?.name}</span>
      </div>
      <Component />
    </div>
  );
}

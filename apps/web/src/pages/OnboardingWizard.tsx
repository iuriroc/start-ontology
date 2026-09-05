import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface CreatedEntity {
  id: string;
  name: string;
}

const STEPS = [
  "Bem-vindo",
  "Primeiro cadastro",
  "Segundo cadastro",
  "Conectar os dois",
  "Pronto"
];

/**
 * Guided "build your first ontology" flow. The point isn't to be exhaustive
 * — it's to get a first-time user through the one thing that isn't obvious
 * from the sidebar alone: that a Cadastro (Entity) is just a "thing", and a
 * Conexão (Relationship) is what turns a pile of things into an ontology.
 */
export function OnboardingWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [entityAName, setEntityAName] = useState("");
  const [entityADescription, setEntityADescription] = useState("");
  const [entityA, setEntityA] = useState<CreatedEntity | null>(null);

  const [entityBName, setEntityBName] = useState("");
  const [entityBDescription, setEntityBDescription] = useState("");
  const [entityB, setEntityB] = useState<CreatedEntity | null>(null);

  const [connectionType, setConnectionType] = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [connectionDone, setConnectionDone] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const createEntityA = async () => {
    if (!entityAName.trim()) {
      setError("Dê um nome ao primeiro cadastro");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<CreatedEntity>("/entities", {
        name: entityAName,
        description: entityADescription,
        status: "ACTIVE"
      });
      setEntityA(created);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o cadastro");
    } finally {
      setSaving(false);
    }
  };

  const createEntityB = async () => {
    if (!entityBName.trim()) {
      setError("Dê um nome ao segundo cadastro");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<CreatedEntity>("/entities", {
        name: entityBName,
        description: entityBDescription,
        status: "ACTIVE"
      });
      setEntityB(created);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o cadastro");
    } finally {
      setSaving(false);
    }
  };

  const createConnection = async () => {
    if (!connectionType.trim() || !entityA || !entityB) {
      setError("Dê um nome para o tipo de conexão");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/relationships", {
        name: connectionName || connectionType,
        type: connectionType,
        sourceLabel: "Entity",
        sourceId: entityA.id,
        targetLabel: "Entity",
        targetId: entityB.id,
        cardinality: "MANY_TO_MANY",
        status: "ACTIVE"
      });
      setConnectionDone(true);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a conexão");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>🪄 Assistente Guiado</h2>
        <button className="btn" onClick={() => navigate("/")}>
          Pular tour
        </button>
      </div>

      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <div key={label} className={`wizard-step ${i === step ? "current" : i < step ? "done" : ""}`}>
            <span className="wizard-step-dot">{i < step ? "✓" : i + 1}</span>
            {label}
          </div>
        ))}
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="panel" style={{ padding: 24, maxWidth: 560 }}>
        {step === 0 && (
          <>
            <h3>O que é uma ontologia, na prática?</h3>
            <p>
              É um mapa do seu negócio: as <strong>coisas</strong> que existem (clientes, produtos, pedidos...) e
              como elas se <strong>conectam</strong> entre si. Nada aqui é executado automaticamente — você só
              está desenhando o mapa.
            </p>
            <p>Neste tour rápido você vai:</p>
            <ol>
              <li>Criar um Cadastro (uma "coisa" do seu negócio)</li>
              <li>Criar um segundo Cadastro</li>
              <li>Ligar os dois com uma Conexão</li>
            </ol>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => setStep(1)}>
                Vamos lá
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h3>1. Crie seu primeiro Cadastro</h3>
            <p className="muted">
              Um Cadastro é qualquer "coisa" do seu negócio — uma pessoa, um produto, um pedido. Comece por algo
              simples, como "Cliente".
            </p>
            <div className="field">
              <label>Nome</label>
              <input placeholder="ex.: Cliente" value={entityAName} onChange={(e) => setEntityAName(e.target.value)} />
            </div>
            <div className="field">
              <label>Descrição (opcional)</label>
              <textarea value={entityADescription} onChange={(e) => setEntityADescription(e.target.value)} />
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => void createEntityA()} disabled={saving}>
                {saving ? "Criando…" : "Criar e continuar"}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3>2. Agora um segundo Cadastro</h3>
            <p className="muted">
              Para ter algo para conectar, crie mais um. Se o primeiro foi "Cliente", este pode ser "Pedido".
            </p>
            <div className="field">
              <label>Nome</label>
              <input placeholder="ex.: Pedido" value={entityBName} onChange={(e) => setEntityBName(e.target.value)} />
            </div>
            <div className="field">
              <label>Descrição (opcional)</label>
              <textarea value={entityBDescription} onChange={(e) => setEntityBDescription(e.target.value)} />
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => void createEntityB()} disabled={saving}>
                {saving ? "Criando…" : "Criar e continuar"}
              </button>
            </div>
          </>
        )}

        {step === 3 && entityA && entityB && (
          <>
            <h3>3. Conecte os dois</h3>
            <p className="muted">
              Uma Conexão tem sempre três partes: <strong>de onde parte</strong>, o <strong>tipo</strong> da
              ligação, e <strong>para onde vai</strong>. Isso é o que transforma cadastros soltos em uma ontologia.
            </p>
            <p style={{ fontSize: 14 }}>
              <strong>{entityA.name}</strong> → <em>tipo da conexão</em> → <strong>{entityB.name}</strong>
            </p>
            <div className="field">
              <label>Tipo de conexão</label>
              <input
                placeholder="ex.: FEZ"
                value={connectionType}
                onChange={(e) => setConnectionType(e.target.value.toUpperCase())}
              />
            </div>
            <div className="field">
              <label>Nome da conexão (opcional)</label>
              <input value={connectionName} onChange={(e) => setConnectionName(e.target.value)} />
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => void createConnection()} disabled={saving}>
                {saving ? "Conectando…" : "Criar conexão"}
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h3>🎉 Pronto! Você já tem uma mini-ontologia.</h3>
            {connectionDone && entityA && entityB && (
              <p>
                <strong>{entityA.name}</strong> → <code>{connectionType}</code> → <strong>{entityB.name}</strong>
              </p>
            )}
            <p>Alguns próximos passos, quando fizer sentido para você:</p>
            <ul>
              <li>
                Continue adicionando Cadastros, Temas, Regras e o que mais precisar no menu à esquerda — cada
                página tem uma caixa "💡" explicando aquele bloco.
              </li>
              <li>
                Veja tudo junto no <Link to="/graph">Graph Studio</Link>, o mapa visual da sua ontologia.
              </li>
              <li>
                Quando estiver satisfeito com uma versão, salve um marco em <Link to="/versions">Histórico</Link> e
                gere uma cópia de segurança em <Link to="/backup">Backup</Link>.
              </li>
            </ul>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => navigate("/")}>
                Ir para a Visão Geral
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import type { OntologyLabel } from "./labels.js";

export const RESOURCE_GROUPS = [
  "Domínio & Negócio",
  "Agentes & Capacidades",
  "Operações & Auditoria"
] as const;
export type ResourceGroup = (typeof RESOURCE_GROUPS)[number];

/** Display/navigation/teaching metadata for each CRUD resource. No Zod
 * coupling here so both the API route registry and the web sidebar/help
 * panels can share it. `group`/`icon`/`color` drive the sidebar layout;
 * `helpText`/`example` back the "what is this / how do I use it" panel
 * shown on each resource page so building the ontology doesn't require
 * knowing the underlying graph model. */
export interface ResourceMeta {
  key: string;
  label: OntologyLabel;
  path: string;
  displayName: string;
  group: ResourceGroup;
  icon: string;
  color: string;
  helpText: string;
  example: string;
}

export const RESOURCE_LIST: ResourceMeta[] = [
  {
    key: "entities",
    label: "Entity",
    path: "entities",
    displayName: "Cadastros",
    group: "Domínio & Negócio",
    icon: "🧱",
    color: "#3454d1",
    helpText: "As \"coisas\" do seu negócio — pessoas, produtos, pedidos, o que existe de fato. Cada cadastro pode ganhar campos próprios (nome, e-mail, etc.).",
    example: "Ex.: Cliente, Vendedor, Produto, Pedido"
  },
  {
    key: "concepts",
    label: "Concept",
    path: "concepts",
    displayName: "Temas",
    group: "Domínio & Negócio",
    icon: "💡",
    color: "#7c3aed",
    helpText: "Uma ideia ou rótulo que se aplica a um cadastro, geralmente definida por uma regra. Não existe sozinho — ele descreve outra coisa.",
    example: "Ex.: \"Cliente VIP\", \"Pedido de Risco\""
  },
  {
    key: "rules",
    label: "Rule",
    path: "rules",
    displayName: "Regras",
    group: "Domínio & Negócio",
    icon: "📏",
    color: "#ea580c",
    helpText: "Uma condição do tipo \"SE isso ENTÃO aquilo\". Aqui você só descreve a regra — ninguém a executa automaticamente nesta ferramenta.",
    example: "Ex.: SE faturamento > 250.000 ENTÃO vendedor é VIP"
  },
  {
    key: "states",
    label: "State",
    path: "states",
    displayName: "Situações",
    group: "Domínio & Negócio",
    icon: "🚦",
    color: "#0891b2",
    helpText: "As fases possíveis de algo. Marque se é o início ou o fim, e ligue uma situação na outra para desenhar o fluxo.",
    example: "Ex.: Aberto → Em andamento → Concluído"
  },
  {
    key: "policies",
    label: "Policy",
    path: "policies",
    displayName: "Diretrizes",
    group: "Domínio & Negócio",
    icon: "🛡️",
    color: "#b45309",
    helpText: "Uma regra de acesso ou comportamento que um Agente deve seguir. Só é registrada aqui, não é aplicada automaticamente.",
    example: "Ex.: \"Não pode ver dados financeiros sem autorização\""
  },
  {
    key: "capabilities",
    label: "Capability",
    path: "capabilities",
    displayName: "Habilidades",
    group: "Agentes & Capacidades",
    icon: "⚡",
    color: "#059669",
    helpText: "Algo que um Agente sabe ou pode fazer. Depois, conecte a Habilidade ao Agente em \"Conexões\".",
    example: "Ex.: Ler pedidos, Criar ocorrência"
  },
  {
    key: "agents",
    label: "Agent",
    path: "agents",
    displayName: "Agentes",
    group: "Agentes & Capacidades",
    icon: "🤖",
    color: "#db2777",
    helpText: "Alguém (ou algo) que atua no seu negócio. Aqui você só cadastra quem ele é — nada é executado por esta ferramenta.",
    example: "Ex.: Atendente de Suporte, Robô de Cobrança"
  },
  {
    key: "relationships",
    label: "RelationshipDefinition",
    path: "relationships",
    displayName: "Conexões",
    group: "Agentes & Capacidades",
    icon: "🔗",
    color: "#64748b",
    helpText: "O jeito de ligar dois blocos: escolha de onde parte, o tipo da ligação e para onde vai. É assim que a ontologia vira um mapa, não uma lista solta.",
    example: "Ex.: Vendedor → POSSUI → Cliente"
  },
  {
    key: "issues",
    label: "Issue",
    path: "issues",
    displayName: "Ocorrências",
    group: "Operações & Auditoria",
    icon: "🗂️",
    color: "#dc2626",
    helpText: "Um problema ou pendência do dia a dia que vale a pena registrar na ontologia.",
    example: "Ex.: Problema de pagamento, Reembolso pendente"
  },
  {
    key: "handoffs",
    label: "Handoff",
    path: "handoffs",
    displayName: "Handoff",
    group: "Operações & Auditoria",
    icon: "🤝",
    color: "#4f46e5",
    helpText: "A passagem de responsabilidade de um Agente para outro — quem entrega, quem recebe, e por quê.",
    example: "Ex.: Atendente Nível 1 repassa para Nível 2"
  },
  {
    key: "decisions",
    label: "Decision",
    path: "decisions",
    displayName: "Decisões",
    group: "Operações & Auditoria",
    icon: "🧭",
    color: "#0d9488",
    helpText: "Um registro de uma decisão que foi tomada em algum processo, com o motivo por trás dela.",
    example: "Ex.: \"Aprovado reembolso parcial\""
  },
  {
    key: "executions",
    label: "Execution",
    path: "executions",
    displayName: "Atividades",
    group: "Operações & Auditoria",
    icon: "⚙️",
    color: "#7c2d12",
    helpText: "Um registro de que algo foi executado — apenas o histórico, esta ferramenta não executa nada sozinha.",
    example: "Ex.: Envio de e-mail de cobrança rodou às 10h"
  },
  {
    key: "learning-events",
    label: "LearningEvent",
    path: "learning-events",
    displayName: "Aprendizados",
    group: "Operações & Auditoria",
    icon: "🎓",
    color: "#65a30d",
    helpText: "Algo que foi aprendido a partir de um processo ou resultado — só o registro, sem nenhum machine learning aqui.",
    example: "Ex.: \"Clientes que ligam 2x cancelam mais\""
  }
];

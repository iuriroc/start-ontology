import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  useEdgesState,
  useNodesState
} from "reactflow";
import "reactflow/dist/style.css";
import { RESOURCE_LIST } from "@ontology-builder/shared";
import { ApiError, api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { HelpPanel } from "../components/HelpPanel";
import { colorFor } from "./nodeColors";

const displayNameFor = (type: string) => RESOURCE_LIST.find((r) => r.label === type)?.displayName ?? type;

interface ApiNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}
interface ApiEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  relationshipDefinitionId: string | null;
}
type Layout = Record<string, { x: number; y: number }>;

function fallbackPosition(index: number, typeIndex: number): { x: number; y: number } {
  return { x: typeIndex * 260 + 40, y: (index % 12) * 90 + 40 };
}

/** React Flow canvas backed by GET /api/ontology/graph. Positions are
 * loaded/saved separately via /api/ontology/graph/layout so dragging a node
 * never touches its semantic properties (spec section 33). */
export function OntologyGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Record<string, unknown>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<ApiNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edgeToDelete, setEdgeToDelete] = useState<ApiEdge | null>(null);
  const layoutRef = useRef<Layout>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [graph, layout] = await Promise.all([
        api.get<{ nodes: ApiNode[]; edges: ApiEdge[] }>("/ontology/graph"),
        api.get<Layout>("/ontology/graph/layout")
      ]);
      layoutRef.current = layout;

      const typeOrder: string[] = [];
      const typeCounts: Record<string, number> = {};
      const flowNodes: Node[] = graph.nodes.map((n) => {
        if (!typeOrder.includes(n.type)) typeOrder.push(n.type);
        const typeIndex = typeOrder.indexOf(n.type);
        const idx = typeCounts[n.type] ?? 0;
        typeCounts[n.type] = idx + 1;
        const position = layout[n.id] ?? fallbackPosition(idx, typeIndex);
        return {
          id: n.id,
          position,
          data: { label: `${n.type}\n${(n.data.name as string) ?? n.id.slice(0, 8)}`, raw: n },
          style: {
            background: colorFor(n.type),
            color: "#fff",
            borderRadius: 8,
            fontSize: 11,
            padding: 8,
            whiteSpace: "pre-line",
            width: 160
          }
        };
      });

      const flowEdges: Edge[] = graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        data: { raw: e },
        style: { stroke: "#94a3b8" },
        labelStyle: { fontSize: 10 }
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o mapa");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persistLayout = useCallback((next: Layout) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void api.put("/ontology/graph/layout", next);
    }, 600);
  }, []);

  const onNodeDragStop = useCallback<NodeMouseHandler>(
    (_event, node) => {
      layoutRef.current = { ...layoutRef.current, [node.id]: node.position };
      persistLayout(layoutRef.current);
    },
    [persistLayout]
  );

  const onNodeClick = useCallback<NodeMouseHandler>((_event, node) => {
    setSelected((node.data as { raw: ApiNode }).raw);
  }, []);

  const onEdgeClick = useCallback<EdgeMouseHandler>((_event, edge) => {
    const raw = (edge.data as { raw: ApiEdge }).raw;
    if (raw.relationshipDefinitionId) setEdgeToDelete(raw);
  }, []);

  const confirmDeleteEdge = async () => {
    if (!edgeToDelete?.relationshipDefinitionId) return;
    try {
      await api.delete(`/relationships/${edgeToDelete.relationshipDefinitionId}?hard=true&force=true`);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setEdgeToDelete(null);
      await load();
    }
  };

  const legend = useMemo(
    () => Array.from(new Set(nodes.map((n) => (n.data as { raw: ApiNode }).raw.type))),
    [nodes]
  );

  return (
    <div>
      <div className="page-header">
        <h2>🕸️ Graph Studio</h2>
        <button className="btn" onClick={() => void load()}>
          Atualizar
        </button>
      </div>
      <HelpPanel
        title='O que é o "Graph Studio"?'
        text="O mapa visual da sua ontologia: cada bloco vira um cartão colorido, e cada conexão vira uma linha com o tipo escrito nela. Arraste para organizar — a posição fica salva."
        example="Clique num cartão para ver seus detalhes, ou numa linha para excluir aquela conexão."
      />
      {error && <div className="banner banner-error">{error}</div>}
      <div style={{ display: "flex", gap: 16 }}>
        <div className="graph-container" style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable nodeColor={(n) => (n.style?.background as string) ?? "#999"} />
          </ReactFlow>
        </div>
        <div className="panel" style={{ width: 280, padding: 14, flexShrink: 0 }}>
          <h4 style={{ marginTop: 0 }}>Legenda</h4>
          {legend.map((type) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colorFor(type), display: "inline-block" }} />
              {displayNameFor(type)}
            </div>
          ))}
          <h4>Item selecionado</h4>
          {!selected && <p className="muted">Clique num cartão para ver seus detalhes.</p>}
          {selected && (
            <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {JSON.stringify(selected.data, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {edgeToDelete && (
        <ConfirmDialog
          title="Excluir esta conexão?"
          message={`Excluir a conexão do tipo "${edgeToDelete.label}"?`}
          confirmLabel="Excluir"
          danger
          onCancel={() => setEdgeToDelete(null)}
          onConfirm={() => void confirmDeleteEdge()}
        />
      )}
    </div>
  );
}

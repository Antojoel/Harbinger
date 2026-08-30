import React, { useMemo, useEffect, useRef, useCallback } from "react";
import ReactFlow, { Background, Controls, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import { useGraph } from "@/context/GraphContext";

// Colours are pulled from the design tokens in src/index.css and pinned as
// mid-tone hsl() literals here because React Flow renders nodes/edges with
// inline styles that can't consume Tailwind classes or resolve `var(--x)`
// reliably inside its SVG layer. Each value is a deliberate midpoint between
// the light and dark token so a single literal stays legible on both the
// white (`--card` light) and near-black (`--card` dark) panel grounds.
//   HSCode                 -> --primary        (222 76% 52% / 221 84% 66%)
//   Country / DocumentType  -> --muted-foreground (220 12% 42% / 220 14% 62%)
//   CertificateRequirement -> --ok             (172 64% 34% / 172 58% 46%)
//   Shipment               -> --warn           (34 92% 46% / 34 90% 58%)
//   Pattern                -> --chart-4 purple  (262 52% 58% / 262 60% 68%)
//   RejectionReason        -> --danger         (356 68% 50% / 356 72% 62%)
export const TYPE_STYLE = {
  HSCode: { dot: "hsl(222 82% 60%)", fg: "hsl(222 78% 62%)" },
  Country: { dot: "hsl(220 13% 55%)", fg: "hsl(220 12% 56%)" },
  CertificateRequirement: { dot: "hsl(172 58% 42%)", fg: "hsl(172 52% 45%)" },
  DocumentType: { dot: "hsl(220 13% 58%)", fg: "hsl(220 12% 58%)" },
  Shipment: { dot: "hsl(34 90% 52%)", fg: "hsl(34 82% 50%)" },
  Pattern: { dot: "hsl(262 58% 64%)", fg: "hsl(262 56% 65%)" },
  RejectionReason: { dot: "hsl(356 72% 60%)", fg: "hsl(356 68% 62%)" },
};

// Edge tints, same light/dark-midpoint reasoning.
const EDGE_REJECTION = "hsl(356 72% 60%)";
const EDGE_DEFAULT = "hsl(220 12% 60%)";
// `<Background>` dot grid — the spec asks for `hsl(var(--border))` but the
// pattern fill is inlined into React Flow's SVG, so a fixed neutral that
// reads faintly on both grounds is used instead.
const GRID_DOT = "hsl(220 10% 70%)";

const NODE_RADIUS = 9;
const NODE_BOX_W = 132;
const NODE_BOX_H = 44;

// Node labels that are machine identifiers (HS codes like "8471.30",
// container ids like "MSKU1234567") get the mono face; human-readable
// labels (country names, pattern descriptions) stay in the sans stack.
const CODE_TYPES = new Set(["HSCode", "Shipment"]);

// A network graph like this one has edges radiating in every direction, not
// just left-to-right - a single Handle pinned to the node's visual center
// (rather than one per side) lets React Flow draw a straight line between
// whatever two centers are involved, from any angle.
function CGNode({ data }) {
  const st = TYPE_STYLE[data.type] || TYPE_STYLE.DocumentType;
  const isCode = CODE_TYPES.has(data.type);
  return (
    <div
      className={`flex flex-col items-center ${data.isNew ? "cg-node-new" : ""}`}
      style={{ width: 132 }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, top: NODE_RADIUS, left: "50%" }}
      />
      <Handle
        type="source"
        position={Position.Top}
        style={{ opacity: 0, top: NODE_RADIUS, left: "50%" }}
      />
      <div
        className="cg-node-box rounded-full border-2 border-card shadow-sm"
        style={{ background: st.dot, width: NODE_RADIUS * 2, height: NODE_RADIUS * 2 }}
      />
      <div
        className={`mt-1 max-w-[132px] text-center text-[10px] font-medium leading-tight ${
          isCode ? "font-mono" : ""
        }`}
        style={{ color: st.fg }}
      >
        {data.label}
      </div>
    </div>
  );
}

const nodeTypes = { cg: CGNode };

/** Static force-directed layout: run the simulation to completion up front
 * (no animation) rather than ticking on every render, so panning/zooming
 * stays smooth and node positions don't jitter as you interact. */
function layoutWithForces(nodes, edges) {
  const simNodes = nodes.map((n) => ({ id: n.id }));
  const simLinks = edges
    .filter((e) => nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to))
    .map((e) => ({ source: e.from, target: e.to }));

  const sim = forceSimulation(simNodes)
    .force("link", forceLink(simLinks).id((n) => n.id).distance(90).strength(0.6))
    .force("charge", forceManyBody().strength(-220))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide(46))
    .stop();

  for (let i = 0; i < 300; i++) sim.tick();

  const positions = new Map(simNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  return positions;
}

/** `nodes` / `edges` are optional overrides used by the Graph Explorer page to
 *  render a filtered subset. Omitted (the default everywhere else), the panel
 *  renders the full graph straight from GraphContext exactly as before. */
export const GraphPanel = ({ compact = false, nodes, edges }) => {
  const { graph: fullGraph, newIds, refresh } = useGraph();
  const graph = useMemo(
    () => ({ nodes: nodes ?? fullGraph.nodes, edges: edges ?? fullGraph.edges }),
    [nodes, edges, fullGraph]
  );
  const flowRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fit = useCallback(() => {
    const inst = flowRef.current;
    const el = wrapRef.current;
    if (!inst || !el || el.clientHeight < 8 || el.clientWidth < 8) return;
    inst.fitView({ padding: 0.18, duration: 0 });
  }, []);

  // React Flow's initial fitView can run before the panel has real dimensions
  // (it lives in a sticky flex column / a Sheet that mounts hidden) or before
  // the custom nodes have reported their size. Re-fit on container resize and
  // poll briefly after mount so the graph never renders blank / off-canvas.
  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const timers = [80, 200, 450, 900].map((ms) => setTimeout(fit, ms));
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => requestAnimationFrame(fit));
      ro.observe(wrapRef.current);
    }
    return () => {
      timers.forEach(clearTimeout);
      ro?.disconnect();
    };
  }, [fit]);

  const { rfNodes, rfEdges } = useMemo(() => {
    const positions = layoutWithForces(graph.nodes, graph.edges);

    const rfNodes = graph.nodes.map((n) => {
      const pos = positions.get(n.id) || { x: 0, y: 0 };
      return {
        id: n.id,
        type: "cg",
        position: pos,
        // Explicit dimensions so React Flow doesn't hold nodes at
        // visibility:hidden waiting on an internal measure that can race the
        // first paint when the dock mounts inside a tall sticky column.
        width: NODE_BOX_W,
        height: NODE_BOX_H,
        data: { label: n.label, type: n.type, isNew: newIds.nodes.includes(n.id) },
        draggable: true,
      };
    });

    const rfEdges = graph.edges.map((e) => {
      // The locked /api/graph contract (TASKS.md) uses from/to, not
      // source/target, and never included an id - synthesized here to
      // match the exact scheme ui_adapter.py's /api/outcome already uses
      // for added_edges, so the "just grew" highlight animation matches up.
      const id = `${e.from}->${e.to}`;
      const isNew = newIds.edges.includes(id);
      return {
        id,
        source: e.from,
        target: e.to,
        animated: isNew,
        className: isNew ? "cg-edge-new" : "",
        style: {
          stroke: e.type === "CAUSED_REJECTION" ? EDGE_REJECTION : EDGE_DEFAULT,
          strokeWidth: e.type === "CAUSED_REJECTION" ? 1.5 : 1.25,
        },
      };
    });
    return { rfNodes, rfEdges };
  }, [graph, newIds]);

  useEffect(() => {
    if (flowRef.current) requestAnimationFrame(fit);
  }, [rfNodes.length, fit]);

  return (
    <div ref={wrapRef} className="h-full w-full" data-testid="immune-memory-graph-canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        onInit={(inst) => {
          flowRef.current = inst;
          requestAnimationFrame(() => inst.fitView({ padding: 0.18, duration: 0 }));
        }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background color={GRID_DOT} gap={22} size={1} />
        {!compact && <Controls showInteractive={false} />}
      </ReactFlow>
    </div>
  );
};

export const GraphLegend = () => {
  const items = [
    ["HSCode", "HS code"],
    ["CertificateRequirement", "Certificate"],
    ["Shipment", "Shipment"],
    ["Pattern", "Pattern"],
    ["RejectionReason", "Rejection"],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(([t, label]) => {
        const st = TYPE_STYLE[t];
        return (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px]"
            style={{ color: st.fg, borderColor: st.dot }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: st.dot }} />
            {label}
          </span>
        );
      })}
    </div>
  );
};

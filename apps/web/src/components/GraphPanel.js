import React, { useMemo, useEffect } from "react";
import ReactFlow, { Background, Controls, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import { useGraph } from "@/context/GraphContext";

const TYPE_STYLE = {
  HSCode: { dot: "hsl(210 85% 55%)", fg: "hsl(210 90% 30%)" },
  Country: { dot: "hsl(215 16% 55%)", fg: "hsl(222 47% 20%)" },
  CertificateRequirement: { dot: "hsl(173 60% 40%)", fg: "hsl(173 70% 26%)" },
  DocumentType: { dot: "hsl(215 16% 65%)", fg: "hsl(215 16% 40%)" },
  Shipment: { dot: "hsl(38 92% 50%)", fg: "hsl(38 92% 32%)" },
  Pattern: { dot: "hsl(262 55% 55%)", fg: "hsl(262 45% 40%)" },
  RejectionReason: { dot: "hsl(0 72% 51%)", fg: "hsl(0 72% 42%)" },
};

const NODE_RADIUS = 9;

// A network graph like this one has edges radiating in every direction, not
// just left-to-right - a single Handle pinned to the node's visual center
// (rather than one per side) lets React Flow draw a straight line between
// whatever two centers are involved, from any angle.
function CGNode({ data }) {
  const st = TYPE_STYLE[data.type] || TYPE_STYLE.DocumentType;
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
        className="rounded-full border-2 border-white shadow-md"
        style={{ background: st.dot, width: NODE_RADIUS * 2, height: NODE_RADIUS * 2 }}
      />
      <div
        className="mt-1 max-w-[132px] text-center text-[10px] font-medium leading-tight"
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

export const GraphPanel = ({ compact = false }) => {
  const { graph, newIds, refresh } = useGraph();

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { rfNodes, rfEdges } = useMemo(() => {
    const positions = layoutWithForces(graph.nodes, graph.edges);

    const rfNodes = graph.nodes.map((n) => {
      const pos = positions.get(n.id) || { x: 0, y: 0 };
      return {
        id: n.id,
        type: "cg",
        position: pos,
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
          stroke: e.type === "CAUSED_REJECTION" ? "hsl(0 72% 55%)" : "hsl(214 15% 70%)",
          strokeWidth: 1.25,
        },
      };
    });
    return { rfNodes, rfEdges };
  }, [graph, newIds]);

  return (
    <div className="h-full w-full" data-testid="immune-memory-graph-canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background color="hsl(214 20% 88%)" gap={22} size={1} />
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

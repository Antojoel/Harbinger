import React, { useMemo, useEffect } from "react";
import ReactFlow, { Background, Controls, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";
import { useGraph } from "@/context/GraphContext";
import { ScrollArea } from "@/components/ui/scroll-area";

const TYPE_STYLE = {
  HSCode: { bg: "hsl(210 90% 96%)", fg: "hsl(210 90% 30%)", bd: "hsl(210 60% 82%)" },
  Country: { bg: "hsl(210 20% 96%)", fg: "hsl(222 47% 20%)", bd: "hsl(214 20% 85%)" },
  CertificateRequirement: { bg: "hsl(173 55% 95%)", fg: "hsl(173 70% 26%)", bd: "hsl(173 40% 80%)" },
  DocumentType: { bg: "hsl(0 0% 100%)", fg: "hsl(215 16% 40%)", bd: "hsl(214 20% 88%)" },
  Shipment: { bg: "hsl(38 90% 96%)", fg: "hsl(38 92% 32%)", bd: "hsl(38 60% 82%)" },
  Pattern: { bg: "hsl(262 60% 97%)", fg: "hsl(262 45% 40%)", bd: "hsl(262 40% 85%)" },
  RejectionReason: { bg: "hsl(0 85% 96%)", fg: "hsl(0 72% 42%)", bd: "hsl(0 55% 84%)" },
};

const COL_ORDER = [
  "DocumentType",
  "Country",
  "HSCode",
  "CertificateRequirement",
  "Shipment",
  "Pattern",
  "RejectionReason",
];

function CGNode({ data }) {
  const st = TYPE_STYLE[data.type] || TYPE_STYLE.DocumentType;
  return (
    <div className={data.isNew ? "cg-node-new" : ""}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        className="cg-node-box rounded-lg border px-2.5 py-1.5 shadow-sm"
        style={{ background: st.bg, borderColor: st.bd, maxWidth: 176 }}
      >
        <div className="text-[9px] uppercase tracking-wide font-medium" style={{ color: st.fg, opacity: 0.7 }}>
          {data.type}
        </div>
        <div className="text-[11px] font-medium leading-tight" style={{ color: st.fg }}>
          {data.label}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

// Define nodeTypes outside component to prevent React Flow warnings and ResizeObserver errors
const nodeTypes = { cg: CGNode };

export const GraphPanel = ({ compact = false }) => {
  const { graph, newIds, refresh } = useGraph();

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { rfNodes, rfEdges } = useMemo(() => {
    const byType = {};
    COL_ORDER.forEach((t) => (byType[t] = []));
    graph.nodes.forEach((n) => {
      (byType[n.type] = byType[n.type] || []).push(n);
    });
    const colGap = 210;
    const rowGap = 66;
    const rfNodes = [];
    COL_ORDER.forEach((type, ci) => {
      (byType[type] || []).forEach((n, ri) => {
        rfNodes.push({
          id: n.id,
          type: "cg",
          position: { x: ci * colGap, y: ri * rowGap },
          data: { label: n.label, type: n.type, isNew: newIds.nodes.includes(n.id) },
          draggable: true,
        });
      });
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
        label: undefined,
        animated: isNew,
        className: isNew ? "cg-edge-new" : "",
        style: {
          stroke: e.type === "CAUSED_REJECTION" ? "hsl(0 72% 55%)" : "hsl(214 15% 70%)",
          strokeWidth: 1.5,
        },
        markerEnd: { type: "arrowclosed", color: "hsl(214 15% 65%)" },
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
        minZoom={0.3}
        maxZoom={1.5}
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
            style={{ background: st.bg, color: st.fg, borderColor: st.bd }}
          >
            <span className="h-2 w-2 rounded-sm" style={{ background: st.fg, opacity: 0.6 }} />
            {label}
          </span>
        );
      })}
    </div>
  );
};

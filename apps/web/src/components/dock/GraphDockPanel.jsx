import React from "react";
import { GraphPanel, GraphLegend } from "@/components/GraphPanel";
import { useGraph } from "@/context/GraphContext";

export function GraphDockPanel() {
  const { graph } = useGraph();
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Immune memory
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {graph.nodes.length}n · {graph.edges.length}e
        </span>
      </div>
      <div className="mb-2">
        <GraphLegend />
      </div>
      <div
        className="flex-1 overflow-hidden rounded-lg border border-border bg-card"
        data-testid="immune-memory-panel"
      >
        <GraphPanel />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Grows on camera when you record a real outcome — the memory that prevents the
        same failure next time.
      </p>
    </div>
  );
}

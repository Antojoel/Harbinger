import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraphPanel, TYPE_STYLE } from "@/components/GraphPanel";
import { useGraph } from "@/context/GraphContext";
import { stagger } from "@/lib/motion";
import { RotateCcw, Network, Loader2 } from "lucide-react";

// Order mirrors the reference legend panel. Left value is the node `type` the
// engine emits on /api/graph; right value is what a human calls it.
const NODE_TYPES = [
  ["HSCode", "HS Code"],
  ["Country", "Country"],
  ["CertificateRequirement", "Certificate"],
  ["DocumentType", "Document"],
  ["RejectionReason", "Rejection"],
  ["Pattern", "Pattern"],
  ["Shipment", "Shipment"],
];

// Relationship names in the immune-memory graph. `tone` maps onto the design
// tokens rather than the inline hsl() literals GraphPanel needs for SVG.
const EDGE_TYPES = [
  ["REQUIRES", "text-foreground"],
  ["CONTRADICTS", "text-danger"],
  ["CAUSED_REJECTION", "text-danger"],
  ["RESOLVED_BY", "text-ok"],
  ["MATCHES", "text-muted-foreground"],
  ["DECLARES_HS", "text-muted-foreground"],
  ["DESTINED_FOR", "text-muted-foreground"],
];

const ALL_ON = Object.fromEntries(NODE_TYPES.map(([t]) => [t, true]));

export default function GraphExplorer() {
  const { graph, loading } = useGraph();
  const [enabled, setEnabled] = useState(ALL_ON);

  const isFiltered = NODE_TYPES.some(([t]) => !enabled[t]);

  // Node counts come off the *unfiltered* graph so the checkbox labels keep
  // showing how much is hidden, not how much is left.
  const totals = useMemo(() => {
    const counts = {};
    graph.nodes.forEach((n) => {
      counts[n.type] = (counts[n.type] || 0) + 1;
    });
    return counts;
  }, [graph.nodes]);

  const filtered = useMemo(() => {
    const nodes = graph.nodes.filter((n) => enabled[n.type] !== false);
    const kept = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => kept.has(e.from) && kept.has(e.to));
    return { nodes, edges };
  }, [graph, enabled]);

  const toggle = (type) => setEnabled((prev) => ({ ...prev, [type]: !prev[type] }));
  const reset = () => setEnabled(ALL_ON);

  return (
    <div className="space-y-5" data-testid="graph-explorer-page">
      <header className="cg-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Graph Explorer
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Immune Memory Graph — every clearance the engine has learned from.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={reset}
          disabled={!isFiltered}
          data-testid="graph-reset-button"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card
          className="cg-rise shrink-0 p-4 lg:w-[260px] lg:self-start"
          style={stagger(1)}
          data-testid="graph-legend-panel"
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Node types
          </div>

          <div className="mt-3 space-y-0.5">
            {NODE_TYPES.map(([type, label]) => {
              const st = TYPE_STYLE[type];
              const on = enabled[type] !== false;
              return (
                <label
                  key={type}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors duration-fast hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(type)}
                    className="h-3.5 w-3.5 shrink-0 accent-primary"
                    aria-label={`Show ${label} nodes`}
                  />
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: st?.dot, opacity: on ? 1 : 0.3 }}
                  />
                  <span
                    className={`flex-1 truncate text-xs ${
                      on ? "text-foreground" : "text-muted-foreground line-through"
                    }`}
                  >
                    {label}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {totals[type] || 0}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Edge key
            </div>
            <ul className="mt-2 space-y-1.5">
              {EDGE_TYPES.map(([type, tone]) => (
                <li key={type} className="flex items-center gap-2">
                  <span className={`h-px w-4 shrink-0 bg-current ${tone}`} />
                  <span className="font-mono text-[10px] text-muted-foreground">{type}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
            Showing{" "}
            <span className="font-mono font-medium text-foreground tabular-nums">
              {filtered.nodes.length}
            </span>{" "}
            nodes ·{" "}
            <span className="font-mono font-medium text-foreground tabular-nums">
              {filtered.edges.length}
            </span>{" "}
            edges
            {isFiltered && (
              <span className="mt-1 block text-[10px]">
                of {graph.nodes.length} / {graph.edges.length} total
              </span>
            )}
          </div>
        </Card>

        <Card
          className="cg-rise relative min-w-0 flex-1 overflow-hidden p-0"
          style={{ ...stagger(2), height: "calc(100vh - 240px)", minHeight: 420 }}
          data-testid="graph-explorer-canvas"
        >
          {loading && graph.nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading immune memory…
            </div>
          ) : filtered.nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="rounded-full bg-muted p-3">
                <Network className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">Nothing to draw</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Every node type is filtered out — re-enable one on the left.
              </p>
            </div>
          ) : (
            <GraphPanel nodes={filtered.nodes} edges={filtered.edges} />
          )}
        </Card>
      </div>
    </div>
  );
}

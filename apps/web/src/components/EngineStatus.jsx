import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Live engine health, read from the real graph endpoint — green only when
 *  the immune-memory graph actually answers with nodes. */
export function EngineStatus() {
  const [state, setState] = useState("checking");
  const [nodes, setNodes] = useState(0);

  useEffect(() => {
    let alive = true;
    const check = () =>
      api
        .graph()
        .then((g) => {
          if (!alive) return;
          setNodes(g?.nodes?.length || 0);
          setState(g?.nodes?.length ? "healthy" : "degraded");
        })
        .catch(() => alive && setState("down"));
    check();
    const id = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const tone =
    state === "healthy" ? "bg-ok" : state === "down" ? "bg-danger" : "bg-warn";
  const label =
    state === "healthy"
      ? "Healthy"
      : state === "down"
      ? "Unreachable"
      : state === "degraded"
      ? "Graph empty"
      : "Checking";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-3 pr-3.5 text-xs shadow-sm">
      <span className="text-muted-foreground">Engine status</span>
      <span className="inline-flex items-center gap-1.5 font-medium">
        <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
        {label}
      </span>
      {state === "healthy" && (
        <span className="font-mono text-[11px] text-muted-foreground">{nodes}n</span>
      )}
    </div>
  );
}

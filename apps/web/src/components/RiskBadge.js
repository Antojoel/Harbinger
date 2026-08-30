import React from "react";

// Semantic risk scale — token classes only, no ad-hoc hsl.
const STYLES = {
  low: "bg-ok-soft text-ok-foreground",
  medium: "bg-warn-soft text-warn-foreground",
  high: "bg-danger-soft text-danger-foreground",
};
const DOT = {
  low: "bg-ok",
  medium: "bg-warn",
  high: "bg-danger",
};
const LABEL = { low: "Low", medium: "Medium", high: "High" };

export const RiskBadge = ({ band, score, showLabel = true, testid }) => {
  const b = band || (score >= 60 ? "high" : score >= 25 ? "medium" : "low");
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[b] || STYLES.low}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[b] || DOT.low}`} />
      {typeof score === "number" ? (
        <span className="font-mono tabular-nums">{score}</span>
      ) : null}
      {showLabel ? <span className="opacity-80">{LABEL[b] || LABEL.low}</span> : null}
    </span>
  );
};

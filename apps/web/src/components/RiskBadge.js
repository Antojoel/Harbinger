import React from "react";

const STYLES = {
  low: "bg-[hsl(173_55%_95%)] text-[hsl(173_70%_28%)] border-[hsl(173_40%_85%)]",
  medium: "bg-[hsl(38_90%_95%)] text-[hsl(38_92%_35%)] border-[hsl(38_60%_85%)]",
  high: "bg-[hsl(0_85%_96%)] text-[hsl(0_72%_45%)] border-[hsl(0_55%_86%)]",
};
const DOT = {
  low: "bg-[hsl(173_70%_33%)]",
  medium: "bg-[hsl(38_92%_45%)]",
  high: "bg-[hsl(0_72%_51%)]",
};

export const RiskBadge = ({ band, score, showLabel = true, testid }) => {
  const b = band || (score >= 60 ? "high" : score >= 25 ? "medium" : "low");
  const label = { low: "Low", medium: "Medium", high: "High" }[b];
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[b]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[b]}`} />
      {typeof score === "number" ? `${score}` : ""}
      {showLabel ? <span className="opacity-80">{label}</span> : null}
    </span>
  );
};

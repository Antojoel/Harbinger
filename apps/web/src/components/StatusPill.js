import React from "react";

const MAP = {
  Draft: "bg-slate-100 text-slate-600 border-slate-200",
  "Ready to file": "bg-[hsl(210_90%_96%)] text-[hsl(210_90%_35%)] border-[hsl(210_60%_88%)]",
  Filed: "bg-[hsl(210_90%_96%)] text-[hsl(210_90%_35%)] border-[hsl(210_60%_88%)]",
  Cleared: "bg-[hsl(173_55%_95%)] text-[hsl(173_70%_28%)] border-[hsl(173_40%_85%)]",
  Held: "bg-[hsl(38_90%_95%)] text-[hsl(38_92%_35%)] border-[hsl(38_60%_85%)]",
  Rejected: "bg-[hsl(0_85%_96%)] text-[hsl(0_72%_45%)] border-[hsl(0_55%_86%)]",
};

export const StatusPill = ({ status }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
      MAP[status] || MAP.Draft
    }`}
  >
    {status}
  </span>
);

import React from "react";

// Status pill — semantic tokens + a leading dot. Same status strings as before.
const MAP = {
  Draft: "bg-muted text-muted-foreground",
  "Ready to file": "bg-accent text-accent-foreground",
  Filed: "bg-accent text-accent-foreground",
  Cleared: "bg-ok-soft text-ok-foreground",
  Held: "bg-warn-soft text-warn-foreground",
  Rejected: "bg-danger-soft text-danger-foreground",
};
const DOT = {
  Draft: "bg-muted-foreground",
  "Ready to file": "bg-primary",
  Filed: "bg-primary",
  Cleared: "bg-ok",
  Held: "bg-warn",
  Rejected: "bg-danger",
};

export const StatusPill = ({ status }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
      MAP[status] || MAP.Draft
    }`}
  >
    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[status] || DOT.Draft}`} />
    {status}
  </span>
);

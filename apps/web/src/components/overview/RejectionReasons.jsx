import React from "react";
import { ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { stagger } from "@/lib/motion";

const REASON_LABELS = {
  UNIT_MISMATCH: "Unit mismatch (invoice vs packing list)",
  MISSING_CERTIFICATE: "Missing certificate",
  HS_CODE_MISMATCH: "HS code mismatch",
  HS_CODE_DEPRECATED: "Deprecated HS code",
};

const humanise = (code) =>
  REASON_LABELS[code] ||
  String(code || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

export function RejectionReasons({ reasons }) {
  const rows = reasons || [];
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-9 text-center">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No rejection reasons yet</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Reasons appear once the engine flags a shipment.
        </p>
      </div>
    );
  }

  const total = rows.reduce((sum, r) => sum + (r.count || 0), 0) || 1;

  return (
    <ul className="space-y-3.5">
      {rows.slice(0, 5).map((r, i) => {
        const share = Math.round(((r.count || 0) / total) * 100);
        return (
          <li key={r.code || i} className="cg-rise" style={stagger(i)}>
            <div className="mb-1.5 flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-sm">{humanise(r.code)}</span>
              <span className="font-mono text-xs font-semibold tabular-nums">{share}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-slow ease-expo"
                style={{ width: `${Math.max(4, share)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RejectionReasonsSkeleton() {
  return (
    <ul className="space-y-4">
      {[0, 1, 2, 3].map((i) => (
        <li key={i}>
          <Skeleton className="mb-2 h-3.5 w-2/3" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </li>
      ))}
    </ul>
  );
}

import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, PackageSearch } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { StatusPill } from "@/components/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { stagger } from "@/lib/motion";

export function RecentShipments({ shipments }) {
  const navigate = useNavigate();
  const rows = shipments || [];

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
        <PackageSearch className="h-5 w-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No shipments yet</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add a shipment to start building the immune memory.
        </p>
      </div>
    );
  }

  return (
    <ul className="-mx-2">
      {rows.map((s, i) => (
        <li key={s.id} className="cg-rise" style={stagger(i)}>
          <button
            type="button"
            onClick={() => navigate(`/shipment/${s.id}`)}
            data-testid={`overview-shipment-${s.id}`}
            className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-fast hover:bg-muted"
          >
            <span className="w-[168px] shrink-0 truncate font-mono text-[13px] font-medium">
              {s.ref}
            </span>
            <span className="hidden min-w-0 flex-1 truncate text-[13px] text-muted-foreground sm:block">
              {s.pol} <span className="opacity-60">&rarr;</span> {s.pod}
            </span>
            <span className="ml-auto shrink-0">
              <RiskBadge band={s.risk_band} score={s.hold_probability} />
            </span>
            <span className="hidden shrink-0 md:block">
              <StatusPill status={s.status} />
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-fast group-hover:opacity-100" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RecentShipmentsSkeleton() {
  return (
    <ul className="space-y-3.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-[168px]" />
          <Skeleton className="hidden h-4 flex-1 sm:block" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="hidden h-5 w-24 rounded-full md:block" />
        </li>
      ))}
    </ul>
  );
}

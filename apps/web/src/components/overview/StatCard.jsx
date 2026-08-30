import React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { stagger } from "@/lib/motion";

// One soft-tinted icon tile per card — token pairs only, never raw hex.
export const TONES = {
  blue: "bg-accent text-accent-foreground",
  red: "bg-danger-soft text-danger-foreground",
  green: "bg-ok-soft text-ok-foreground",
  purple: "bg-warn-soft text-warn-foreground",
};

export function StatCard({ icon: Icon, tone = "blue", label, value, sub, index = 0, testid }) {
  return (
    <Card
      data-testid={testid}
      className="cg-rise rounded-xl p-4 sm:p-5"
      style={stagger(index)}
    >
      <span
        className={`mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl ${TONES[tone] || TONES.blue}`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <div className="text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-[26px] font-semibold leading-tight tabular-nums tracking-tight sm:text-[30px]">
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>
    </Card>
  );
}

export function StatCardSkeleton({ index = 0 }) {
  return (
    <Card className="cg-rise rounded-xl p-4 sm:p-5" style={stagger(index)}>
      <Skeleton className="mb-3.5 h-10 w-10 rounded-xl" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2.5 h-7 w-16" />
      <Skeleton className="mt-2 h-3 w-28" />
    </Card>
  );
}

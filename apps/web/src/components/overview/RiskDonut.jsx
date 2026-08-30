import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartColors } from "./useChartColors";

const BANDS = [
  { key: "low", label: "Low Risk", dot: "bg-ok", color: "c2" },
  { key: "medium", label: "Medium Risk", dot: "bg-warn", color: "c3" },
  { key: "high", label: "High Risk", dot: "bg-danger", color: "c4" },
];

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

export function RiskDonut({ bands }) {
  const colors = useChartColors();
  const safe = { low: 0, medium: 0, high: 0, ...(bands || {}) };
  const total = safe.low + safe.medium + safe.high;

  // recharts needs at least one non-zero slice to draw a ring; when the book
  // is empty we draw a flat muted ring instead of inventing data.
  const data = total
    ? BANDS.filter((b) => safe[b.key] > 0).map((b) => ({
        name: b.label,
        value: safe[b.key],
        fill: colors[b.color],
      }))
    : [{ name: "No shipments", value: 1, fill: colors.grid }];

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-2">
      <div className="relative h-[172px] w-[172px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={total > 1 ? 2 : 0}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[28px] font-semibold tabular-nums leading-none tracking-tight">
            {total}
          </span>
          <span className="mt-1 text-[11px] uppercase tracking-[0.07em] text-muted-foreground">
            Shipments
          </span>
        </div>
      </div>

      <ul className="w-full flex-1 space-y-1 sm:pl-4">
        {BANDS.map((b) => (
          <li
            key={b.key}
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm"
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${b.dot}`} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{b.label}</span>
            <span className="font-mono text-sm font-semibold tabular-nums">{safe[b.key]}</span>
            <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {pct(safe[b.key], total)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RiskDonutSkeleton() {
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-2">
      <Skeleton className="h-[172px] w-[172px] shrink-0 rounded-full" />
      <div className="w-full flex-1 space-y-3 sm:pl-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    </div>
  );
}

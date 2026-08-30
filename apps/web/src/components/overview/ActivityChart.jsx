import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartColors } from "./useChartColors";

function ChartTooltip({ active, payload, label, colors }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md"
      style={{ background: colors.card }}
    >
      <div className="mb-1 font-mono text-[11px] text-muted-foreground">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize text-muted-foreground">{p.dataKey}</span>
          <span className="ml-auto font-mono font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ActivityChart({ series }) {
  const colors = useChartColors();
  const data = series || [];
  const isEmpty = data.every((d) => !d.checks && !d.outcomes);
  const tick = { fill: colors.axis, fontSize: 11, fontFamily: "var(--font-mono)" };

  return (
    <div>
      <div className="h-[196px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 30, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="ovChecks" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.c1} stopOpacity={0.34} />
                <stop offset="100%" stopColor={colors.c1} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="ovOutcomes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.c2} stopOpacity={0.22} />
                <stop offset="100%" stopColor={colors.c2} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label" tick={tick} tickLine={false}
              axisLine={{ stroke: colors.grid }} dy={4}
            />
            <YAxis
              tick={tick} tickLine={false} axisLine={false}
              allowDecimals={false} width={44} domain={[0, (m) => Math.max(4, m)]}
            />
            <RTooltip
              cursor={{ stroke: colors.grid }}
              content={<ChartTooltip colors={colors} />}
            />
            <Area
              type="monotone" dataKey="checks" stroke={colors.c1} strokeWidth={2}
              fill="url(#ovChecks)" dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0, fill: colors.c1 }}
            />
            <Area
              type="monotone" dataKey="outcomes" stroke={colors.c2} strokeWidth={1.75}
              fill="url(#ovOutcomes)" dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0, fill: colors.c2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-chart-1" /> Risk checks
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-chart-2" /> Outcomes recorded
        </span>
        {isEmpty ? (
          <span className="ml-auto">No engine activity recorded yet this session</span>
        ) : null}
      </div>
    </div>
  );
}

export function ActivityChartSkeleton() {
  return (
    <div>
      <Skeleton className="h-[196px] w-full rounded-lg" />
      <Skeleton className="mt-3 h-3 w-52" />
    </div>
  );
}

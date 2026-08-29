import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtINR } from "@/lib/api";
import { RiskBadge } from "@/components/RiskBadge";
import { StatusPill } from "@/components/StatusPill";
import { MockedBadge } from "@/components/MockedBadge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingDown, AlertTriangle, Gauge, Boxes, ChevronRight } from "lucide-react";

const Stat = ({ icon: Icon, label, value, sub, tint }) => (
  <Card className="p-4">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-4 w-4" style={{ color: tint }} /> {label}
    </div>
    <div className="mt-1.5 font-heading text-2xl font-semibold tracking-tight">{value}</div>
    {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
  </Card>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("all");
  const [risk, setRisk] = useState("all");

  const load = async () => {
    const [s, list] = await Promise.all([api.stats(), api.shipments({ status, risk })]);
    setStats(s);
    setRows(list);
  };

  useEffect(() => {
    api.shipments({ status, risk }).then(setRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, risk]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Control Tower</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            Import containers, priced by the hour they might stall. <MockedBadge />
          </p>
        </div>
      </div>

      {/* impact strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats ? (
          <>
            <Stat icon={Boxes} label="Shipments" value={stats.total_shipments} sub="in the book" tint="hsl(210 90% 40%)" />
            <Stat icon={AlertTriangle} label="At risk" value={stats.at_risk} sub="hold risk ≥ 25" tint="hsl(38 92% 45%)" />
            <Stat icon={Gauge} label="Avg hold risk" value={`${stats.avg_hold_probability}%`} sub="across book" tint="hsl(0 72% 51%)" />
            <Stat icon={TrendingDown} label="Cost avoided" value={fmtINR(stats.cost_avoided_inr)} sub={`${stats.outcomes_recorded} outcomes recorded`} tint="hsl(173 70% 33%)" />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] w-full rounded-xl" />)
        )}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[170px] text-sm" data-testid="shipments-filter-status-select">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {["all", "Draft", "Ready to file", "Cleared", "Held", "Rejected"].map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={risk} onValueChange={setRisk}>
          <SelectTrigger className="h-9 w-[150px] text-sm" data-testid="shipments-filter-risk-select">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            {["all", "high", "medium", "low"].map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All risk bands" : s[0].toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(status !== "all" || risk !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setStatus("all"); setRisk("all"); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* table */}
      <Card className="overflow-hidden">
        <Table data-testid="shipments-table">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Shipment</TableHead>
              <TableHead>Hold risk</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Importer</TableHead>
              <TableHead className="hidden lg:table-cell">HS code</TableHead>
              <TableHead className="hidden xl:table-cell">POL → POD</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows &&
              [0, 1, 2, 3, 4].map((i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ))}
            {rows && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No shipments match your filters.
                </TableCell>
              </TableRow>
            )}
            {rows && rows.map((s) => (
              <TableRow
                key={s.id}
                data-testid="shipment-row-open-detail"
                onClick={() => navigate(`/shipment/${s.id}`)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell>
                  <div className="font-medium">{s.ref}</div>
                  <div className="text-xs text-muted-foreground">{s.goods_desc}</div>
                </TableCell>
                <TableCell><RiskBadge band={s.risk_band} score={s.hold_probability} /></TableCell>
                <TableCell><StatusPill status={s.status} /></TableCell>
                <TableCell className="hidden md:table-cell text-sm">{s.importer_name}</TableCell>
                <TableCell className="hidden lg:table-cell"><span className="font-mono text-xs">{s.hs_code}</span></TableCell>
                <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                  <span className="font-mono">{s.pol}</span> → <span className="font-mono">{s.pod}</span>
                </TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { stagger } from "@/lib/motion";
import { RiskBadge } from "@/components/RiskBadge";
import { StatusPill } from "@/components/StatusPill";
import { MockedBadge } from "@/components/MockedBadge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ShieldCheck, ChevronRight, PackageSearch } from "lucide-react";

const BAND_ORDER = { high: 0, medium: 1, low: 2 };
const BAND_ACCENT = { high: "bg-danger", medium: "bg-warn", low: "bg-ok" };
const BAND_FILTERS = [
  { v: "all", label: "All" },
  { v: "high", label: "High" },
  { v: "medium", label: "Medium" },
  { v: "low", label: "Low" },
];

export default function RiskCheck() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [band, setBand] = useState("all");

  useEffect(() => {
    api.shipments().then(setRows).catch(() => setRows([]));
  }, []);

  const results = useMemo(() => {
    if (!rows) return null;
    const needle = q.trim().toLowerCase();
    return rows
      .filter((s) => (band === "all" ? true : s.risk_band === band))
      .filter((s) =>
        !needle
          ? true
          : [s.ref, s.goods_desc, s.importer_name, s.hs_code, s.pol, s.pod]
              .filter(Boolean)
              .some((f) => String(f).toLowerCase().includes(needle))
      )
      .slice()
      .sort(
        (a, b) =>
          (BAND_ORDER[a.risk_band] ?? 3) - (BAND_ORDER[b.risk_band] ?? 3) ||
          b.hold_probability - a.hold_probability
      );
  }, [rows, q, band]);

  return (
    <div className="space-y-6">
      <header className="cg-rise">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Risk Check</h1>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Pick a shipment to open its full risk dossier — issues, factors, and recommended actions.
          <MockedBadge />
        </p>
      </header>

      {/* search + band filter */}
      <div className="cg-rise flex flex-wrap items-center gap-2" style={stagger(1)}>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by reference, importer, HS code or port…"
            className="pl-9"
            aria-label="Search shipments"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {BAND_FILTERS.map((b) => (
            <button
              key={b.v}
              onClick={() => setBand(b.v)}
              aria-pressed={band === b.v}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-fast ${
                band === b.v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {!results && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[124px] w-full rounded-lg" />
          ))}
        </div>
      )}

      {results && results.length === 0 && (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <PackageSearch className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">No shipments match</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a different search term or risk band.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => { setQ(""); setBand("all"); }}>
            Clear filters
          </Button>
        </Card>
      )}

      {results && results.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((s, i) => (
            <button
              key={s.id}
              onClick={() => navigate(`/shipment/${s.id}`)}
              style={stagger(i)}
              className="cg-rise group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all duration-normal ease-expo hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
            >
              <span
                className={`absolute inset-y-0 left-0 w-1 ${BAND_ACCENT[s.risk_band] || BAND_ACCENT.low}`}
                aria-hidden
              />
              <div className="flex items-start justify-between gap-2 pl-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-semibold">{s.ref}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{s.goods_desc}</div>
                </div>
                <RiskBadge band={s.risk_band} score={s.hold_probability} />
              </div>

              <div className="mt-3 flex items-center gap-2 pl-2 font-mono text-sm">
                <span>{s.pol}</span>
                <span className="text-muted-foreground" aria-hidden>→</span>
                <span>{s.pod}</span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 pl-2">
                <StatusPill status={s.status} />
                <span className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity duration-fast group-hover:opacity-100">
                  Run check <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

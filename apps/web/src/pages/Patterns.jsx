import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { stagger } from "@/lib/motion";
import { ChevronRight, Search, SlidersHorizontal, Brain } from "lucide-react";

const CONFIDENCE_BANDS = [
  { id: "high", label: "High", min: 0.75, chip: "bg-danger-soft text-danger-foreground" },
  { id: "medium", label: "Medium", min: 0.4, chip: "bg-warn-soft text-warn-foreground" },
  { id: "low", label: "Low", min: -Infinity, chip: "bg-ok-soft text-ok-foreground" },
];

const bandFor = (confidence) =>
  CONFIDENCE_BANDS.find((b) => Number(confidence || 0) >= b.min) || CONFIDENCE_BANDS[2];

const SORTS = [
  { id: "frequency", label: "Most frequent" },
  { id: "confidence", label: "Highest confidence" },
  { id: "id", label: "Pattern ID" },
];

/** `unit_mismatch` -> `Unit mismatch`. The engine emits snake_case pattern
 *  types; this is the only place they're turned into prose. */
const humanizeType = (type) => {
  const words = String(type || "pattern").replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const pct = (confidence) => `${Math.round(Number(confidence || 0) * 100)}%`;

function PatternRow({ pattern, index, isOpen, onToggle }) {
  const band = bandFor(pattern.confidence);
  const title = humanizeType(pattern.type);
  return (
    <div className="cg-rise border-b border-border last:border-b-0" style={stagger(index)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-fast hover:bg-muted/60 sm:px-5"
      >
        <ChevronRight
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-fast ${
            isOpen ? "rotate-90" : ""
          }`}
        />
        <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {pattern.pattern_id}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${band.chip}`}>
              {band.label}
            </span>
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{pattern.frequency}</span> occurrences ·{" "}
            <span className="font-mono tabular-nums">{pct(pattern.confidence)}</span> confidence
          </span>
        </span>
      </button>

      {isOpen && (
        <div className="cg-fade px-4 pb-4 pl-11 sm:px-5 sm:pl-14">
          <div className="rounded-md bg-muted p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Reason code
              </span>
              <span className="rounded-sm bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {pattern.reason_code || "—"}
              </span>
            </div>
            <p className="mt-2 text-sm text-foreground">
              {pattern.detail || "No further detail recorded for this pattern."}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>
                Type <span className="font-mono text-foreground">{pattern.type}</span>
              </span>
              <span>
                Seen <span className="font-mono text-foreground tabular-nums">{pattern.frequency}×</span>
              </span>
              <span>
                Confidence{" "}
                <span className="font-mono text-foreground tabular-nums">{pct(pattern.confidence)}</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Patterns() {
  const [patterns, setPatterns] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("frequency");
  const [band, setBand] = useState("all");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .patterns()
      .then((d) => alive && setPatterns(d.patterns || []))
      .catch(() => alive && setPatterns([]));
    return () => {
      alive = false;
    };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (patterns || []).filter((p) => {
      if (band !== "all" && bandFor(p.confidence).id !== band) return false;
      if (!q) return true;
      return [p.pattern_id, p.type, p.detail, p.reason_code]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    const sorted = [...rows];
    if (sort === "frequency") sorted.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
    if (sort === "confidence") sorted.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    if (sort === "id") sorted.sort((a, b) => String(a.pattern_id).localeCompare(String(b.pattern_id)));
    return sorted;
  }, [patterns, query, sort, band]);

  const loading = patterns === null;
  const total = patterns?.length || 0;

  return (
    <div className="space-y-6" data-testid="patterns-page">
      <header className="cg-rise flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Patterns Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? (
              "Loading learned patterns…"
            ) : (
              <>
                <span className="font-mono font-medium text-foreground tabular-nums">{total}</span>{" "}
                {total === 1 ? "pattern" : "patterns"} learned from past clearances
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patterns…"
              aria-label="Search patterns"
              data-testid="patterns-search-input"
              className="h-9 w-full pl-8 sm:w-64"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 shadow-sm">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort patterns"
              className="bg-transparent py-0.5 text-xs text-foreground outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="cg-rise flex flex-wrap items-center gap-1.5" style={stagger(1)}>
        {[{ id: "all", label: "All confidence" }, ...CONFIDENCE_BANDS].map((b) => {
          const active = band === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBand(b.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors duration-fast ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {b.label}
            </button>
          );
        })}
        {(query || band !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setQuery("");
              setBand("all");
            }}
          >
            Reset
          </Button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        {loading && (
          <div className="divide-y divide-border">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-4">
                <Skeleton className="h-4 w-16 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="rounded-full bg-muted p-3">
              <Brain className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">
              {total === 0 ? "No patterns learned yet" : "No patterns match this filter"}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {total === 0
                ? "Run a risk check and record its outcome — the engine writes what it learns back here."
                : "Try a different search term or confidence band."}
            </p>
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div data-testid="patterns-list">
            {visible.map((p, i) => (
              <PatternRow
                key={p.pattern_id}
                pattern={p}
                index={i}
                isOpen={openId === p.pattern_id}
                onToggle={() => setOpenId(openId === p.pattern_id ? null : p.pattern_id)}
              />
            ))}
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div className="border-t border-border bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground">
            Showing <span className="font-mono tabular-nums text-foreground">{visible.length}</span> of{" "}
            <span className="font-mono tabular-nums text-foreground">{total}</span> learned patterns
          </div>
        )}
      </Card>
    </div>
  );
}

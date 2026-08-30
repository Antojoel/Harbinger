import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, fmtINR } from "@/lib/api";
import { prefersReducedMotion, stagger } from "@/lib/motion";
import { useGraph } from "@/context/GraphContext";
import { RiskBadge } from "@/components/RiskBadge";
import { StatusPill } from "@/components/StatusPill";
import { MockedBadge } from "@/components/MockedBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Play, CheckCircle2, XCircle, AlertCircle, Wrench, FileText, Wand2, ChevronRight,
  Loader2, Mail, Sparkles, Check, AlertTriangle, Link2, History, TrendingDown, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

const DOC_LABEL = {
  CommercialInvoice: "Invoice",
  PackingList: "Packing List",
  BillOfLading: "Bill of Lading",
  CertificateOfOrigin: "COO",
  BISRegistration: "BIS",
  DrugImportLicense: "Drug License",
  TextileTestReport: "Test Report",
  WPCEquipmentAuth: "WPC",
};

/* --- reason-code vocabulary -------------------------------------------- */
/* Titles/chips are derived from the engine's own reason codes. Anything the
   engine sends that isn't listed falls back to a prettified code + "Review". */
const CODE_META = {
  MISSING_CERTIFICATE: { title: "Certificate of Origin", chip: "Missing", tone: "danger" },
  UNIT_MISMATCH: { title: "Unit Count Mismatch", chip: "Mismatch", tone: "danger" },
  HS_CODE_MISMATCH: { title: "HS Code Mismatch", chip: "Mismatch", tone: "danger" },
  HS_CODE_DEPRECATED: { title: "HS Code Deprecated", chip: "Mismatch", tone: "warn" },
  INVOICE_INCONSISTENT: { title: "Commercial Invoice", chip: "Review", tone: "warn" },
  DESTINATION_RULE: { title: "Destination Rule", chip: "Review", tone: "warn" },
};
const prettifyCode = (code) =>
  String(code || "issue")
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
const metaFor = (code) =>
  CODE_META[code] || { title: prettifyCode(code), chip: "Review", tone: "warn" };

const CHIP_TONE = {
  danger: "bg-danger-soft text-danger-foreground",
  warn: "bg-warn-soft text-warn-foreground",
  ok: "bg-ok-soft text-ok-foreground",
};
const ICON_TONE = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
};
const BAND_SEGMENT = { high: "bg-danger", medium: "bg-warn", low: "bg-ok" };
const BAND_LABEL = { high: "High Risk", medium: "Medium Risk", low: "Low Risk" };
const BAND_TEXT = {
  high: "text-danger-foreground",
  medium: "text-warn-foreground",
  low: "text-ok-foreground",
};
const SEVERITY_TONE = { High: "danger", Medium: "warn", Low: "ok" };

const OUTCOME_OPTS = [
  { v: "Cleared", icon: CheckCircle2, tone: "ok" },
  { v: "Held", icon: AlertCircle, tone: "warn" },
  { v: "Rejected", icon: XCircle, tone: "danger" },
];
const SELECTED_TONE = {
  ok: "border-ok bg-ok-soft text-ok-foreground",
  warn: "border-warn bg-warn-soft text-warn-foreground",
  danger: "border-danger bg-danger-soft text-danger-foreground",
};
const DOT_TONE = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" };

const SECTION_TITLE = "font-display text-sm font-semibold tracking-tight";
const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground";

/* --- small presentational pieces ---------------------------------------- */

const SegmentedBar = ({ score, band, segments = 10 }) => {
  const lit = Math.round((Math.max(0, Math.min(100, score)) / 100) * segments);
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          className={`h-2 flex-1 rounded-[2px] transition-colors duration-slow ease-expo ${
            i < lit ? BAND_SEGMENT[band] || BAND_SEGMENT.low : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
};

const Chip = ({ tone, children }) => (
  <span
    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
      CHIP_TONE[tone] || CHIP_TONE.warn
    }`}
  >
    {children}
  </span>
);

const CheckRow = ({ row, onApprove, onEmailDraft, busy, resolved }) => {
  const tone = resolved || row.status === "ok" ? "ok" : row.status === "pending_human" ? "warn" : "danger";
  const label = resolved
    ? "Resolved"
    : row.status === "ok"
    ? "Verified"
    : row.status === "pending_human"
    ? "Needs human draft"
    : "Blocking";
  return (
    <div
      className={`flex items-center justify-between gap-3 py-2.5 transition-all duration-slow ease-expo ${
        resolved ? "opacity-70" : ""
      }`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_TONE[tone]}`} />
        <div className="min-w-0">
          <div
            className={`flex items-start gap-1.5 text-sm ${
              resolved ? "text-ok-foreground line-through decoration-ok-foreground/40" : ""
            }`}
          >
            {resolved && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />}
            <span>{row.item}</span>
          </div>
          <div className={`text-[11px] ${resolved ? "text-ok-foreground/80" : "text-muted-foreground"}`}>
            {label}
          </div>
        </div>
      </div>
      {!resolved && row.action === "approve_fix" && (
        <Button
          size="sm" className="h-8 shrink-0 gap-1.5" onClick={onApprove} disabled={busy}
          data-testid="approve-fix-button"
        >
          <Wand2 className="h-3.5 w-3.5" /> Approve fix
        </Button>
      )}
      {!resolved && row.action === "human_draft" && (
        <Button
          size="sm" variant="outline" className="h-8 shrink-0 gap-1.5" onClick={() => onEmailDraft(row)}
          data-testid="human-draft-button"
        >
          <Mail className="h-3.5 w-3.5" /> Draft
        </Button>
      )}
    </div>
  );
};

/* ----------------------------------------------------------------------- */

export default function ShipmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { markGrowth } = useGraph();
  const [ship, setShip] = useState(null);
  const [sim, setSim] = useState(null);
  const [patterns, setPatterns] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [busyFix, setBusyFix] = useState(false);
  const [resolvedKeys, setResolvedKeys] = useState(() => new Set());
  const [outcome, setOutcome] = useState("Cleared");
  const [reason, setReason] = useState("");
  const [recording, setRecording] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);

  const load = useCallback(async () => {
    const s = await api.shipment(id);
    setShip(s);
    if (s.latest_simulation) setSim(s.latest_simulation);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.patterns().then((r) => setPatterns(r.patterns || [])).catch(() => {});
    api.pricing().then(setPricing).catch(() => {});
  }, []);

  const runSimulate = async () => {
    setSimulating(true);
    try {
      const res = await api.simulate(id);
      setResolvedKeys(new Set());
      setSim(res);
      await load();
      toast.success(`Simulated — hold risk ${res.score}/100`);
    } catch (e) {
      toast.error("Simulation failed");
    } finally {
      setSimulating(false);
    }
  };

  const runSimulateSilently = async () => {
    try {
      const res = await api.simulate(id);
      setSim(res);
      setResolvedKeys(new Set());
    } catch (e) {}
  };

  const approve = async (fixId, rowKey) => {
    setBusyFix(true);
    setResolvedKeys((s) => new Set(s).add(rowKey));
    try {
      const delay = prefersReducedMotion() ? 0 : 550;
      await new Promise((r) => setTimeout(r, delay));
      await api.approveFix(id, fixId);
      toast.success("Internal defect auto-corrected — net weights normalised to kg");
      await load();
      await runSimulateSilently();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Fix not allowed");
      setResolvedKeys((s) => {
        const n = new Set(s);
        n.delete(rowKey);
        return n;
      });
    } finally {
      setBusyFix(false);
    }
  };

  const emailDraft = (row) => {
    const cert = row.item.replace(" attached", "");
    navigate("/email", {
      state: {
        recipient_email: "",
        subject: `Action needed: ${cert} for ${ship.ref}`,
        body:
          `Dear team,\n\nShipment ${ship.ref} (${ship.goods_desc}, HS ${ship.hs_code}) cannot be filed ` +
          `because the ${cert} is not attached. This certificate is required for HS code ${ship.hs_code} ` +
          `into ${ship.destination_country}. Please share it at the earliest to avoid demurrage.\n\n` +
          `Note: this is a draft for human approval — nothing has been submitted to customs.\n\nRegards,\nHarbinger`,
        shipment_id: ship.id,
      },
    });
  };

  const record = async () => {
    setRecording(true);
    try {
      const res = await api.outcome(id, outcome, reason);
      await markGrowth(res.added_nodes.map((n) => n.id), res.added_edges.map((e) => e.id));
      setDialogOpen(false);
      setReason("");
      const credit = res.outcome.credited_inr;
      toast.success(
        `Outcome recorded: ${outcome}. Memory grew by ${res.added_nodes.length} node(s).` +
          (credit ? ` ${fmtINR(credit)} demurrage avoided.` : "")
      );
      await load();
    } catch (e) {
      toast.error("Could not record outcome");
    } finally {
      setRecording(false);
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error("Could not copy link");
    }
  };

  /* ---- derived data (all from the engine, nothing invented) ---- */

  const checklist = useMemo(() => (sim?.checklist || []), [sim]);

  const issues = useMemo(
    () =>
      checklist
        .map((row, i) => ({ row, i }))
        .filter(({ row }) => row.status !== "ok")
        .map(({ row, i }) => ({ ...metaFor(row.ref), detail: row.item, key: i, row })),
    [checklist]
  );

  const matchedPatterns = useMemo(() => {
    const ids = new Set(sim?.matched_patterns || []);
    return patterns.filter((p) => ids.has(p.pattern_id));
  }, [patterns, sim]);

  const riskFactors = useMemo(() => {
    const byCode = new Map(matchedPatterns.map((p) => [p.reason_code, p]));
    return checklist
      .filter((row) => row.status !== "ok")
      .map((row) => {
        const pattern = byCode.get(row.ref);
        const severity = pattern
          ? pattern.confidence >= 0.8
            ? "High"
            : pattern.confidence >= 0.6
            ? "Medium"
            : "Low"
          : row.status === "blocking"
          ? "High"
          : "Medium";
        return {
          label: metaFor(row.ref).title,
          severity,
          confidence: pattern ? pattern.confidence : null,
        };
      });
  }, [checklist, matchedPatterns]);

  const actions = useMemo(() => {
    const list = [];
    if (sim?.recommended_default) list.push(sim.recommended_default);
    checklist.forEach((row, i) => {
      if (!row.action || resolvedKeys.has(i)) return;
      const label = metaFor(row.ref).title;
      const verb = row.action === "approve_fix" ? "Approve the auto-fix for" : "Request a human-approved draft for";
      const text = `${verb} ${label.toLowerCase()}`;
      if (!list.includes(text)) list.push(text);
    });
    return list;
  }, [sim, checklist, resolvedKeys]);

  const demurrageRate = ship?.demurrage_per_day_inr ?? pricing?.avg_demurrage_per_day_inr ?? null;
  const HOLD_DAYS_LOW = 3;
  const HOLD_DAYS_HIGH = 5;

  if (!ship) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading shipment…
      </div>
    );
  }

  const contradictions = ship.contradictions || [];
  const affectedFields = {
    hs_code: contradictions.some((c) => c.type === "hs_code_mismatch"),
    quantity: contradictions.some((c) => c.type === "unit_mismatch"),
    net_weight: contradictions.some((c) => c.type === "unit_mismatch"),
  };
  const score = sim ? sim.score : ship.hold_probability;
  const band = sim ? sim.band : ship.risk_band;
  const openChecks = checklist.filter((r, i) => r.action && !resolvedKeys.has(i)).length;

  return (
    <div className="space-y-5 pb-10">
      {/* --- page head ---------------------------------------------------- */}
      <header className="cg-rise flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={() => navigate("/shipments")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-[27px]">
            Shipment Risk Check
          </h1>
          <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
            <Link to="/shipments" className="transition-colors hover:text-foreground">Shipments</Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <span className="font-mono text-foreground">{ship.ref}</span>
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={share}>
            {copied ? <Check className="h-4 w-4 text-ok" /> : <Link2 className="h-4 w-4" />}
            {copied ? "Copied" : "Share"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="gap-2" data-testid="record-outcome-button">
                <Sparkles className="h-4 w-4" /> Record outcome
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display tracking-tight">Record real outcome</DialogTitle>
                <DialogDescription>
                  Confirming a real outcome teaches the immune-memory graph. Watch it grow on the right.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2">
                {OUTCOME_OPTS.map(({ v, icon: Icon, tone }) => {
                  const selected = outcome === v;
                  return (
                    <button
                      key={v}
                      onClick={() => setOutcome(v)}
                      data-testid={`outcome-option-${v.toLowerCase()}`}
                      aria-pressed={selected}
                      className={`flex flex-col items-center gap-1.5 rounded-md border p-3 text-sm font-medium transition-all duration-fast ease-out ${
                        selected ? SELECTED_TONE[tone] : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="h-5 w-5" /> {v}
                    </button>
                  );
                })}
              </div>
              <Textarea
                placeholder="Optional note (e.g. cleared after COO uploaded)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <DialogFooter>
                <Button onClick={record} disabled={recording} className="gap-2" data-testid="record-outcome-dialog-confirm">
                  {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Confirm outcome
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        {/* ================= main column ================= */}
        <div className="space-y-5">
          {/* --- hero --- */}
          <Card className="cg-rise overflow-hidden p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-mono text-lg font-semibold tracking-tight">{ship.ref}</h2>
                  <StatusPill status={ship.status} />
                </div>
                <p className="mt-2 flex items-center gap-2 font-display text-xl font-medium tracking-tight">
                  <span className="font-mono">{ship.pol}</span>
                  <span className="text-muted-foreground" aria-hidden>→</span>
                  <span className="font-mono">{ship.pod}</span>
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{ship.goods_desc}</span>
                  <span aria-hidden>·</span>
                  <span className="font-mono">HS {ship.hs_code}</span>
                  <span aria-hidden>·</span>
                  <span>{ship.importer_name}</span>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{ship.destination_country}</span>
                </p>
              </div>

              <div className="text-right">
                <div className={`text-sm font-semibold ${BAND_TEXT[band] || BAND_TEXT.low}`}>
                  {BAND_LABEL[band] || BAND_LABEL.low}
                </div>
                <div className="mt-0.5 flex items-baseline justify-end gap-1">
                  <span
                    className="font-mono text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl"
                    data-testid="simulate-risk-score"
                  >
                    {score}
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">/100</span>
                </div>
                <div className={`mt-0.5 ${EYEBROW}`}>hold probability</div>
              </div>
            </div>

            <div className="mt-5">
              <SegmentedBar score={score} band={band} />
            </div>

            {sim?.summary && (
              <p className="mt-3 text-sm text-muted-foreground">{sim.summary}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <MockedBadge />
            </div>
          </Card>

          {/* --- top issues --- */}
          <Card className="cg-rise p-5" style={stagger(1)}>
            <div className="flex items-center justify-between">
              <h3 className={SECTION_TITLE}>Top Issues</h3>
              {issues.length > 0 && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {issues.length}
                </span>
              )}
            </div>

            {!sim ? (
              <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Run <span className="font-medium text-foreground">Re-check Shipment</span> to score hold
                  risk before filing.
                </p>
              </div>
            ) : issues.length === 0 ? (
              <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-ok-soft p-4 text-sm text-ok-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
                No blocking issues found in the current dossier.
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {issues.map((issue, i) => (
                  <li
                    key={issue.key}
                    className="cg-rise flex items-start justify-between gap-3 py-3"
                    style={stagger(i)}
                    data-testid="simulate-reason-item"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          ICON_TONE[issue.tone] || ICON_TONE.warn
                        }`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{issue.title}</div>
                        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {issue.detail}
                        </div>
                      </div>
                    </div>
                    <Chip tone={issue.tone}>{issue.chip}</Chip>
                  </li>
                ))}
              </ul>
            )}

            {sim && checklist.length > 0 && (
              <>
                <button
                  onClick={() => setChecklistOpen((v) => !v)}
                  aria-expanded={checklistOpen}
                  className="mt-3 flex w-full items-center justify-between rounded-md border-t border-border pt-3 text-sm font-medium text-primary transition-colors hover:text-foreground"
                >
                  <span>
                    {checklistOpen ? "Hide" : "View"} full checklist ({checklist.length} item
                    {checklist.length === 1 ? "" : "s"})
                  </span>
                  {checklistOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {checklistOpen && (
                  <div className="cg-fade mt-1">
                    <div className="divide-y divide-border">
                      {checklist.map((row, i) => (
                        <CheckRow
                          key={i} row={row} busy={busyFix} resolved={resolvedKeys.has(i)}
                          onApprove={() => approve(row.ref || "unit_mismatch", i)}
                          onEmailDraft={emailDraft}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      Auto-fix applies only to internal transcription defects. Missing certificates are
                      always routed to a human-approved draft — never auto-submitted.
                    </p>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* --- consequence + precedent --- */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Card className="cg-rise flex flex-col p-5" style={stagger(2)}>
              <h3 className={SECTION_TITLE}>What happens if not fixed?</h3>
              {openChecks === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Nothing outstanding on this dossier. Re-check after any document change to keep the
                  estimate current.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Unresolved document defects raise the probability of rejection at filing, which leads
                    to a customs hold and container demurrage while the paperwork is corrected.
                  </p>
                  {demurrageRate ? (
                    <>
                      <div className="mt-4 flex items-baseline gap-2">
                        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-danger-foreground sm:text-[28px]">
                          {fmtINR(demurrageRate * HOLD_DAYS_LOW)}
                        </span>
                        <span className="text-danger-foreground" aria-hidden>–</span>
                        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-danger-foreground sm:text-[28px]">
                          {fmtINR(demurrageRate * HOLD_DAYS_HIGH)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground">Estimate</span>, per container —{" "}
                        <span className="font-mono">{fmtINR(demurrageRate)}</span>/day ×{" "}
                        <span className="font-mono">{HOLD_DAYS_LOW}–{HOLD_DAYS_HIGH}</span> days. The daily
                        rate comes from the pricing benchmark; the hold length is an assumption, not a
                        forecast for this shipment.
                      </p>
                    </>
                  ) : (
                    <p className="mt-4 text-xs text-muted-foreground">
                      No demurrage benchmark available — cost exposure cannot be estimated.
                    </p>
                  )}
                </>
              )}
            </Card>

            <Card className="cg-rise flex flex-col p-5" style={stagger(3)}>
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <h3 className={SECTION_TITLE}>Similar Past Cases</h3>
              </div>
              {matchedPatterns.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  The immune-memory graph holds no matching precedent for this shipment yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {matchedPatterns.map((p) => (
                    <li key={p.pattern_id}>
                      <div className="text-sm">
                        <span className="font-mono font-semibold tabular-nums">{p.frequency}</span>{" "}
                        similar shipments had this issue
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.detail} · confidence{" "}
                        <span className="font-mono tabular-nums">
                          {Math.round(p.confidence * 100)}%
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/patterns"
                className="mt-4 flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-foreground"
              >
                View patterns <ChevronRight className="h-4 w-4" />
              </Link>
            </Card>
          </div>

          {/* --- documents --- */}
          <Card className="cg-rise p-5" style={stagger(4)}>
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className={SECTION_TITLE}>Documents</h3>
            </div>
            <Tabs defaultValue={ship.documents[0]?.type}>
              <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
                {ship.documents.map((d) => (
                  <TabsTrigger
                    key={d.type} value={d.type}
                    className="rounded-md border text-xs data-[state=active]:border-primary data-[state=active]:bg-accent"
                  >
                    {DOC_LABEL[d.type] || d.type}
                  </TabsTrigger>
                ))}
              </TabsList>
              {ship.documents.map((d) => (
                <TabsContent key={d.type} value={d.type} className="mt-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">{d.type}</span>
                      <MockedBadge text="Generated" />
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(d.fields || {}).map(([k, v]) => {
                        const bad = affectedFields[k];
                        return (
                          <div key={k} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-muted-foreground">{k}</span>
                            <span
                              className={`font-mono ${
                                bad ? "rounded bg-danger-soft px-1.5 py-0.5 text-danger-foreground" : ""
                              }`}
                            >
                              {v}
                            </span>
                          </div>
                        );
                      })}
                      {d.fixed?.length ? (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-ok-foreground">
                          <Check className="h-3 w-3" /> {d.fixed.join(", ")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </Card>
        </div>

        {/* ================= sidebar ================= */}
        <div className="space-y-5 lg:sticky lg:top-[72px]">
          {/* --- risk factors --- */}
          <Card className="cg-rise p-5" style={stagger(1)}>
            <h3 className={SECTION_TITLE}>Risk Factors</h3>
            {riskFactors.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {sim ? "No factors fired on the latest check." : "Run a check to score risk factors."}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {riskFactors.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{f.label}</div>
                      {f.confidence != null && (
                        <div className="text-[11px] text-muted-foreground">
                          graph confidence{" "}
                          <span className="font-mono tabular-nums">
                            {Math.round(f.confidence * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <Chip tone={SEVERITY_TONE[f.severity]}>{f.severity}</Chip>
                  </li>
                ))}
              </ul>
            )}
            {riskFactors.length > 0 && (
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Only factors that actually fired on this dossier are listed.
              </p>
            )}
          </Card>

          {/* --- recommended actions --- */}
          <Card className="cg-rise p-5" style={stagger(2)}>
            <h3 className={SECTION_TITLE}>Recommended Actions</h3>
            {actions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {sim
                  ? "Nothing outstanding — file, then record the real outcome when it lands."
                  : "Run a check to get a recommended next action."}
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ok-soft">
                      <Check className="h-3 w-3 text-ok" />
                    </span>
                    <span className="leading-relaxed">{a}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button
              onClick={runSimulate}
              disabled={simulating}
              className="mt-4 w-full gap-2"
              data-testid="simulate-button"
            >
              {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Re-check Shipment
            </Button>
          </Card>

          {/* --- default action from engine --- */}
          {sim?.recommended_default && (
            <Alert className="cg-rise border-transparent bg-accent text-accent-foreground" style={stagger(3)}>
              <Wrench className="h-4 w-4" />
              <AlertDescription className="text-xs text-accent-foreground">
                <span className="font-medium">Default action:</span> {sim.recommended_default}
              </AlertDescription>
            </Alert>
          )}

          {openChecks > 0 && (
            <div className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
              <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-mono tabular-nums">{openChecks}</span> open check
                {openChecks === 1 ? "" : "s"} still counting toward the score. Resolve them, then re-check.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

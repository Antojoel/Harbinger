import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, fmtINR } from "@/lib/api";
import { prefersReducedMotion, stagger } from "@/lib/motion";
import { useGraph } from "@/context/GraphContext";
import { RiskBadge } from "@/components/RiskBadge";
import { StatusPill } from "@/components/StatusPill";
import { MockedBadge } from "@/components/MockedBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, ArrowRight, Play, CheckCircle2, XCircle, AlertCircle, Wrench, FileText, Wand2,
  Loader2, Mail, Sparkles, Check,
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
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_TONE[tone]}`} />
        <div>
          <div
            className={`flex items-center gap-1.5 text-sm ${
              resolved ? "text-ok-foreground line-through decoration-ok-foreground/40" : ""
            }`}
          >
            {resolved && <Check className="h-3.5 w-3.5 shrink-0 text-ok" />}
            {row.item}
          </div>
          <div className={`text-[11px] ${resolved ? "text-ok-foreground/80" : "text-muted-foreground"}`}>
            {label}
          </div>
        </div>
      </div>
      {!resolved && row.action === "approve_fix" && (
        <Button
          size="sm" className="h-8 gap-1.5" onClick={onApprove} disabled={busy}
          data-testid="approve-fix-button"
        >
          <Wand2 className="h-3.5 w-3.5" /> Approve fix
        </Button>
      )}
      {!resolved && row.action === "human_draft" && (
        <Button
          size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onEmailDraft(row)}
          data-testid="human-draft-button"
        >
          <Mail className="h-3.5 w-3.5" /> Draft to officer
        </Button>
      )}
    </div>
  );
};

export default function ShipmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { markGrowth } = useGraph();
  const [ship, setShip] = useState(null);
  const [sim, setSim] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [busyFix, setBusyFix] = useState(false);
  const [resolvedKeys, setResolvedKeys] = useState(() => new Set());
  const [outcome, setOutcome] = useState("Cleared");
  const [reason, setReason] = useState("");
  const [recording, setRecording] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    const s = await api.shipment(id);
    setShip(s);
    if (s.latest_simulation) setSim(s.latest_simulation);
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
          `Note: this is a draft for human approval — nothing has been submitted to customs.\n\nRegards,\nClearanceGuard`,
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
    net_weight: contradictions.some((c) => c.type === "unit_mismatch"),
  };
  const score = sim ? sim.score : ship.hold_probability;
  const band = sim ? sim.band : ship.risk_band;
  const barClass = band === "high" ? "bg-danger" : band === "medium" ? "bg-warn" : "bg-ok";

  const openChecks = sim
    ? sim.checklist.filter((r, i) => r.action && !resolvedKeys.has(i)).length
    : 0;
  const nextAction = !sim
    ? "Run a simulation to score hold risk before filing."
    : openChecks > 0
    ? `Resolve ${openChecks} open check${openChecks === 1 ? "" : "s"} below, then re-simulate.`
    : band === "low"
    ? "Low hold risk — file, then record the real outcome when it lands."
    : "Re-check the dossier, then record the outcome once resolved.";

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Control Tower
      </button>

      <header className="cg-rise">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{ship.ref}</h1>
          <StatusPill status={ship.status} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{ship.goods_desc}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{ship.hs_code}</span>
          <span aria-hidden>·</span>
          <span>{ship.importer_name}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{ship.pol}→{ship.pod}</span>
          <MockedBadge />
        </p>
      </header>

      {/* persistent action bar */}
      <div className="sticky bottom-4 z-20 lg:bottom-auto lg:top-[68px]">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-3 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Next action
              </div>
              <div className="truncate text-sm font-medium">{nextAction}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={runSimulate} disabled={simulating} className="gap-2" data-testid="simulate-button">
              {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {sim ? "Re-simulate" : "Simulate"}
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
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Documents */}
        <Card className="cg-rise p-4">
          <div className="mb-3 flex items-center gap-2 font-display font-medium">
            <FileText className="h-4 w-4 text-primary" /> Documents
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

        {/* Risk dossier */}
        <Card className="cg-rise p-4">
          <div className="mb-3 font-display font-medium">Risk dossier</div>
          {!sim ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Run <span className="font-medium text-foreground">Simulate</span> to score hold risk before filing.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="font-mono text-5xl font-semibold tabular-nums tracking-tight"
                      data-testid="simulate-risk-score"
                    >
                      {score}
                    </span>
                    <span className="font-mono text-sm text-muted-foreground">/100</span>
                  </div>
                  <div className="mt-1.5"><RiskBadge band={band} score={score} /></div>
                </div>
                <div className="text-right text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  hold probability
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-slow ease-expo ${barClass}`}
                  style={{ width: `${score}%` }}
                />
              </div>

              <p className="text-sm text-foreground">{sim.summary}</p>

              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Why
                </div>
                <ol className="space-y-1.5">
                  {sim.reasons.map((r, i) => (
                    <li
                      key={i}
                      className="flex gap-2.5 text-sm"
                      data-testid="simulate-reason-item"
                      style={stagger(i)}
                    >
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <Alert className="border-transparent bg-accent text-accent-foreground">
                <Wrench className="h-4 w-4" />
                <AlertDescription className="text-xs text-accent-foreground">
                  <span className="font-medium">Default action:</span> {sim.recommended_default}
                </AlertDescription>
              </Alert>

              <Separator />

              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Compliance checklist
                </div>
                <div className="divide-y divide-border">
                  {sim.checklist.map((row, i) => (
                    <CheckRow
                      key={i} row={row} busy={busyFix} resolved={resolvedKeys.has(i)}
                      onApprove={() => approve(row.ref || "unit_mismatch", i)}
                      onEmailDraft={emailDraft}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Auto-fix applies only to internal transcription defects. Missing certificates are always
                  routed to a human-approved draft — never auto-submitted.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

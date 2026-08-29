import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, fmtINR } from "@/lib/api";
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
  ArrowLeft, Play, CheckCircle2, XCircle, AlertCircle, Wrench, FileText, Wand2,
  Loader2, Mail, Sparkles,
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

const CheckRow = ({ row, onApprove, onEmailDraft, busy }) => {
  const dot =
    row.status === "ok" ? "bg-[hsl(173_70%_33%)]" :
    row.status === "pending_human" ? "bg-[hsl(38_92%_45%)]" : "bg-[hsl(0_72%_51%)]";
  const label =
    row.status === "ok" ? "Verified" :
    row.status === "pending_human" ? "Needs human draft" : "Blocking";
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <div>
          <div className="text-sm">{row.item}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      </div>
      {row.action === "approve_fix" && (
        <Button size="sm" variant="secondary" className="h-8 gap-1.5" onClick={onApprove} disabled={busy}
          data-testid="approve-fix-button">
          <Wand2 className="h-3.5 w-3.5" /> Approve fix
        </Button>
      )}
      {row.action === "human_draft" && (
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onEmailDraft(row)}
          data-testid="human-draft-button">
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
      setSim(res);
      await load();
      toast.success(`Simulated — hold risk ${res.score}/100`);
    } catch (e) {
      toast.error("Simulation failed");
    } finally {
      setSimulating(false);
    }
  };

  const approve = async (fixId) => {
    setBusyFix(true);
    try {
      await api.approveFix(id, fixId);
      toast.success("Internal defect auto-corrected — net weights normalised to kg");
      await load();
      await runSimulateSilently();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Fix not allowed");
    } finally {
      setBusyFix(false);
    }
  };

  const runSimulateSilently = async () => {
    try {
      const res = await api.simulate(id);
      setSim(res);
    } catch (e) {}
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
    return <div className="flex h-64 items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading shipment…
    </div>;
  }

  const contradictions = ship.contradictions || [];
  const affectedFields = {
    hs_code: contradictions.some((c) => c.type === "hs_code_mismatch"),
    net_weight: contradictions.some((c) => c.type === "unit_mismatch"),
  };
  const score = sim ? sim.score : ship.hold_probability;
  const band = sim ? sim.band : ship.risk_band;
  const barColor = band === "high" ? "hsl(0 72% 51%)" : band === "medium" ? "hsl(38 92% 45%)" : "hsl(173 70% 33%)";

  return (
    <div className="space-y-5">
      <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Control Tower
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{ship.ref}</h1>
            <StatusPill status={ship.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {ship.goods_desc} · <span className="font-mono">{ship.hs_code}</span> · {ship.importer_name} ·{" "}
            <span className="font-mono">{ship.pol}→{ship.pod}</span> <MockedBadge />
          </p>
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
                <DialogTitle>Record real outcome</DialogTitle>
                <DialogDescription>
                  Confirming a real outcome teaches the immune-memory graph. Watch it grow on the right.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "Cleared", icon: CheckCircle2, c: "hsl(173 70% 33%)" },
                  { v: "Held", icon: AlertCircle, c: "hsl(38 92% 45%)" },
                  { v: "Rejected", icon: XCircle, c: "hsl(0 72% 51%)" },
                ].map(({ v, icon: Icon, c }) => (
                  <button
                    key={v}
                    onClick={() => setOutcome(v)}
                    data-testid={`outcome-option-${v.toLowerCase()}`}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                      outcome === v ? "border-primary bg-accent" : "hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-5 w-5" style={{ color: c }} /> {v}
                  </button>
                ))}
              </div>
              <Textarea placeholder="Optional note (e.g. cleared after COO uploaded)" value={reason}
                onChange={(e) => setReason(e.target.value)} />
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

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Documents */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 font-heading font-medium">
            <FileText className="h-4 w-4 text-primary" /> Documents
          </div>
          <Tabs defaultValue={ship.documents[0]?.type}>
            <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
              {ship.documents.map((d) => (
                <TabsTrigger key={d.type} value={d.type}
                  className="rounded-md border data-[state=active]:border-primary data-[state=active]:bg-accent text-xs">
                  {DOC_LABEL[d.type] || d.type}
                </TabsTrigger>
              ))}
            </TabsList>
            {ship.documents.map((d) => (
              <TabsContent key={d.type} value={d.type} className="mt-3">
                <div className="rounded-lg border bg-muted/20 p-3">
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
                          <span className={`font-mono ${bad ? "rounded bg-[hsl(0_85%_96%)] px-1.5 py-0.5 text-[hsl(0_72%_42%)]" : ""}`}>
                            {v}
                          </span>
                        </div>
                      );
                    })}
                    {d.fixed?.length ? (
                      <div className="mt-1 text-[11px] text-[hsl(173_70%_30%)]">✓ {d.fixed.join(", ")}</div>
                    ) : null}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </Card>

        {/* Simulate panel */}
        <Card className="p-4">
          <div className="mb-3 font-heading font-medium">Risk dossier</div>
          {!sim ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Run <span className="font-medium text-foreground">Simulate</span> to score hold risk before filing.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-heading text-4xl font-semibold" data-testid="simulate-risk-score">{score}</span>
                    <span className="text-sm text-muted-foreground">/100</span>
                  </div>
                  <div className="mt-1"><RiskBadge band={band} score={score} /></div>
                </div>
                <div className="text-right text-[11px] text-muted-foreground">hold probability</div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: barColor }} />
              </div>

              <p className="text-sm text-foreground">{sim.summary}</p>

              <div>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Why</div>
                <ol className="space-y-1.5">
                  {sim.reasons.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm" data-testid="simulate-reason-item">
                      <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <Alert className="border-[hsl(210_60%_88%)] bg-[hsl(210_90%_97%)]">
                <Wrench className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <span className="font-medium">Default action:</span> {sim.recommended_default}
                </AlertDescription>
              </Alert>

              <Separator />

              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Compliance checklist</div>
                <div className="divide-y">
                  {sim.checklist.map((row, i) => (
                    <CheckRow key={i} row={row} busy={busyFix}
                      onApprove={() => approve(row.ref || "unit_mismatch")}
                      onEmailDraft={emailDraft} />
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

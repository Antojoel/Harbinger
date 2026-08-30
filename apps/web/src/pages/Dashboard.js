import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtINR } from "@/lib/api";
import { stagger } from "@/lib/motion";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { blobToBase64 } from "@/lib/wavRecorder";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, Plus, FileUp, SlidersHorizontal, PackageSearch, Info } from "lucide-react";

const EMPTY_SHIPMENT_FORM = {
  shipment_id: "",
  importer_name: "",
  exporter: "",
  hs_code: "8471.30",
  country: "DE",
  goods_desc: "",
  pol: "",
  pod: "",
  invoice_units: "",
  packing_units: "",
  has_certificate: true,
};

const EMPTY_DOC_FORM = {
  shipment_id: "",
  importer_name: "",
  exporter: "",
  country: "DE",
  goods_desc: "",
  pol: "",
  pod: "",
};

const EMPTY_FILES = {
  commercial_invoice: null,
  packing_list: null,
  bill_of_lading: null,
  certificate_of_origin: null,
};

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <Label className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function FileField({ label, required, file, onChange }) {
  return (
    <Field label={`${label} ${required ? "*" : "· optional"}`}>
      <Input
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      {file && <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{file.name}</div>}
    </Field>
  );
}

function InfoLine({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function AddShipmentDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(EMPTY_SHIPMENT_FORM);
  const [docForm, setDocForm] = useState(EMPTY_DOC_FORM);
  const [files, setFiles] = useState(EMPTY_FILES);
  const [busy, setBusy] = useState(false);
  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target ? e.target.value : e }));
  const setDoc = (field) => (e) => setDocForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async () => {
    if (!form.hs_code || !form.country || !form.invoice_units || !form.packing_units) {
      toast.error("HS code, country, and both unit counts are required");
      return;
    }
    setBusy(true);
    try {
      const created = await api.createShipment({
        shipment_id: form.shipment_id || undefined,
        importer_name: form.importer_name || "Unknown Importer",
        exporter: form.exporter || "Unknown Exporter",
        hs_code: form.hs_code,
        country: form.country,
        goods_desc: form.goods_desc,
        pol: form.pol,
        pod: form.pod,
        invoice_units: Number(form.invoice_units),
        packing_units: Number(form.packing_units),
        has_certificate: form.has_certificate,
      });
      toast.success(`${created.id} created — ${created.hold_probability}% hold risk (${created.risk_band}).`);
      setForm(EMPTY_SHIPMENT_FORM);
      onOpenChange(false);
      onCreated(created.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create shipment");
    } finally {
      setBusy(false);
    }
  };

  const submitFromDocuments = async () => {
    if (!files.commercial_invoice || !files.packing_list || !files.bill_of_lading) {
      toast.error("Commercial invoice, packing list, and bill of lading are all required");
      return;
    }
    if (!docForm.country) {
      toast.error("Destination country is required");
      return;
    }
    setBusy(true);
    try {
      const toDoc = async (file) =>
        file
          ? {
              filename: file.name,
              content_base64: await blobToBase64(file),
              content_type: file.type || undefined,
            }
          : undefined;

      const created = await api.createShipmentFromDocuments({
        shipment_id: docForm.shipment_id || undefined,
        importer_name: docForm.importer_name || "Unknown Importer",
        exporter: docForm.exporter || "Unknown Exporter",
        country: docForm.country,
        goods_desc: docForm.goods_desc,
        pol: docForm.pol,
        pod: docForm.pod,
        commercial_invoice: await toDoc(files.commercial_invoice),
        packing_list: await toDoc(files.packing_list),
        bill_of_lading: await toDoc(files.bill_of_lading),
        certificate_of_origin: await toDoc(files.certificate_of_origin),
      });
      const ex = created.extracted_documents || {};
      toast.success(
        `${created.id} created — ${created.hold_probability}% hold risk (${created.risk_band}). ` +
          `Read from documents: ${ex.commercial_invoice?.units ?? "?"} invoice units, ` +
          `${ex.packing_list?.units ?? "?"} packing units, HS ${ex.bill_of_lading?.hs_code ?? "?"}.`
      );
      setFiles(EMPTY_FILES);
      setDocForm(EMPTY_DOC_FORM);
      onOpenChange(false);
      onCreated(created.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not read documents / create shipment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight">Add a real shipment</DialogTitle>
          <DialogDescription className="text-xs">
            Runs through the actual risk engine against the live immune-memory graph — not canned demo data.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manual" className="mt-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual entry</TabsTrigger>
            <TabsTrigger value="upload">
              <FileUp className="mr-1.5 h-3.5 w-3.5" /> Upload documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-3 pt-3">
            <InfoLine>
              HS <code className="font-mono">8471.30</code> or <code className="font-mono">8504.41</code> into{" "}
              <code className="font-mono">DE</code> fires a real missing-certificate check; other combos still
              simulate for real.
            </InfoLine>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field className="sm:col-span-2" label="Shipment ID · optional">
                <Input value={form.shipment_id} onChange={set("shipment_id")} placeholder="e.g. MYCARGO-001" />
              </Field>
              <Field label="Importer">
                <Input value={form.importer_name} onChange={set("importer_name")} />
              </Field>
              <Field label="Exporter">
                <Input value={form.exporter} onChange={set("exporter")} />
              </Field>
              <Field label="HS code *">
                <Input className="font-mono" value={form.hs_code} onChange={set("hs_code")} placeholder="8471.30" />
              </Field>
              <Field label="Destination country *">
                <Input className="font-mono" value={form.country} onChange={set("country")} placeholder="DE" />
              </Field>
              <Field className="sm:col-span-2" label="Goods description">
                <Input value={form.goods_desc} onChange={set("goods_desc")} placeholder="Laptop computers, 14-inch" />
              </Field>
              <Field label="Port of loading">
                <Input className="font-mono" value={form.pol} onChange={set("pol")} placeholder="CNSHA" />
              </Field>
              <Field label="Port of discharge">
                <Input className="font-mono" value={form.pod} onChange={set("pod")} placeholder="DEHAM" />
              </Field>
              <Field label="Invoice units *">
                <Input type="number" value={form.invoice_units} onChange={set("invoice_units")} />
              </Field>
              <Field label="Packing list units *">
                <Input type="number" value={form.packing_units} onChange={set("packing_units")} />
              </Field>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  id="has_certificate"
                  checked={form.has_certificate}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, has_certificate: !!v }))}
                />
                <Label htmlFor="has_certificate" className="text-xs font-normal">
                  Certificate of Origin attached
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? "Simulating…" : "Create & simulate"}</Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="upload" className="space-y-3 pt-3">
            <InfoLine>
              Vertex AI Gemini reads unit counts and HS codes straight off the invoice, packing list, and bill of
              lading (PDF, PNG, JPEG). No certificate file means no certificate on record — like a real missing document.
            </InfoLine>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field className="sm:col-span-2" label="Shipment ID · optional">
                <Input value={docForm.shipment_id} onChange={setDoc("shipment_id")} placeholder="e.g. MYCARGO-001" />
              </Field>
              <Field label="Importer">
                <Input value={docForm.importer_name} onChange={setDoc("importer_name")} />
              </Field>
              <Field label="Exporter">
                <Input value={docForm.exporter} onChange={setDoc("exporter")} />
              </Field>
              <Field label="Destination country *">
                <Input className="font-mono" value={docForm.country} onChange={setDoc("country")} placeholder="DE" />
              </Field>
              <Field label="Goods description">
                <Input value={docForm.goods_desc} onChange={setDoc("goods_desc")} placeholder="Laptop computers, 14-inch" />
              </Field>
              <Field label="Port of loading">
                <Input className="font-mono" value={docForm.pol} onChange={setDoc("pol")} placeholder="CNSHA" />
              </Field>
              <Field label="Port of discharge">
                <Input className="font-mono" value={docForm.pod} onChange={setDoc("pod")} placeholder="DEHAM" />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FileField
                label="Commercial invoice"
                required
                file={files.commercial_invoice}
                onChange={(f) => setFiles((s) => ({ ...s, commercial_invoice: f }))}
              />
              <FileField
                label="Packing list"
                required
                file={files.packing_list}
                onChange={(f) => setFiles((s) => ({ ...s, packing_list: f }))}
              />
              <FileField
                label="Bill of lading"
                required
                file={files.bill_of_lading}
                onChange={(f) => setFiles((s) => ({ ...s, bill_of_lading: f }))}
              />
              <FileField
                label="Certificate of origin"
                file={files.certificate_of_origin}
                onChange={(f) => setFiles((s) => ({ ...s, certificate_of_origin: f }))}
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submitFromDocuments} disabled={busy}>
                {busy ? "Reading documents…" : "Extract & simulate"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const BAND_TEXT = { high: "text-danger-foreground", medium: "text-warn-foreground", low: "text-ok-foreground" };
const bandOf = (n) => (n >= 60 ? "high" : n >= 25 ? "medium" : "low");

const STAT_LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground";

function MiniStat({ label, value, sub, valueClass = "", delay }) {
  return (
    <Card className="cg-rise flex flex-col justify-between p-4" style={delay}>
      <span className={STAT_LABEL}>{label}</span>
      <span className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</span>
      <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">{sub}</span>
    </Card>
  );
}

function ControlBand({ stats }) {
  if (!stats) {
    return (
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <Skeleton className="col-span-2 h-[128px] w-full rounded-lg lg:col-span-1" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[128px] w-full rounded-lg" />)}
      </section>
    );
  }
  const atRisk = stats.at_risk;
  const avg = stats.avg_hold_probability;
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
      {/* hero — cost avoided */}
      <Card className="cg-rise col-span-2 flex flex-col justify-between p-5 lg:col-span-1">
        <div className="flex items-center justify-between">
          <span className={STAT_LABEL}>Cost avoided</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            demurrage prevented
          </span>
        </div>
        <div className="mt-3 font-mono text-4xl font-semibold tabular-nums tracking-tight text-foreground">
          {fmtINR(stats.cost_avoided_inr)}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {stats.outcomes_recorded > 0 ? (
            <>
              across <span className="font-mono tabular-nums">{stats.outcomes_recorded}</span> recorded outcome
              {stats.outcomes_recorded === 1 ? "" : "s"}
            </>
          ) : (
            "Record a real outcome to start the ledger"
          )}
        </div>
      </Card>

      <MiniStat
        label="Shipments"
        value={stats.total_shipments}
        sub="in the book"
        delay={stagger(1)}
      />
      <MiniStat
        label="At risk"
        value={atRisk}
        valueClass={atRisk > 0 ? "text-warn" : ""}
        sub={<>{atRisk > 0 && <AlertTriangle className="h-3 w-3 text-warn" />} hold risk ≥ 25</>}
        delay={stagger(2)}
      />
      <MiniStat
        label="Avg risk"
        value={`${avg}%`}
        valueClass={BAND_TEXT[bandOf(avg)]}
        sub={<span className="capitalize">{bandOf(avg)} band</span>}
        delay={stagger(3)}
      />
    </section>
  );
}

const STATUS_OPTS = ["all", "Draft", "Ready to file", "Cleared", "Held", "Rejected"];
const RISK_OPTS = ["all", "high", "medium", "low"];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("all");
  const [risk, setRisk] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

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

  const filtered = status !== "all" || risk !== "all";
  const resetFilters = () => { setStatus("all"); setRisk("all"); };

  return (
    <div className="space-y-6">
      <header className="cg-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Control Tower</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            Import containers, priced by the hour they might stall. <MockedBadge />
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add shipment
        </Button>
      </header>

      <AddShipmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(id) => navigate(`/shipment/${id}`)}
      />

      <ControlBand stats={stats} />

      {/* quiet inline filter strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Filter</span>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger
            className="h-8 w-[150px] border-0 bg-muted text-xs shadow-none"
            data-testid="shipments-filter-status-select"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTS.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={risk} onValueChange={setRisk}>
          <SelectTrigger
            className="h-8 w-[132px] border-0 bg-muted text-xs shadow-none"
            data-testid="shipments-filter-risk-select"
          >
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            {RISK_OPTS.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All risk bands" : s[0].toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered && (
          <Button variant="ghost" size="sm" className="h-8" onClick={resetFilters}>
            Clear
          </Button>
        )}
        {rows && (
          <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
            {rows.length} shown
          </span>
        )}
      </div>

      {/* manifest */}
      <Card className="overflow-hidden">
        <Table data-testid="shipments-table">
          <TableHeader>
            <TableRow className="sticky top-0 z-10 border-b bg-card hover:bg-card">
              <TableHead className="text-[11px] uppercase tracking-[0.06em]">Shipment</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.06em]">Hold risk</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.06em]">Status</TableHead>
              <TableHead className="hidden text-[11px] uppercase tracking-[0.06em] md:table-cell">Importer</TableHead>
              <TableHead className="hidden text-[11px] uppercase tracking-[0.06em] lg:table-cell">HS code</TableHead>
              <TableHead className="hidden text-[11px] uppercase tracking-[0.06em] xl:table-cell">POL → POD</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows &&
              [0, 1, 2, 3, 4].map((i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell><Skeleton className="h-4 w-40" /><Skeleton className="mt-1.5 h-3 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))}

            {rows && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-16">
                  <div className="mx-auto flex max-w-sm flex-col items-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <PackageSearch className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm font-medium">
                      {filtered ? "No shipments match this filter" : "No shipments in the book yet"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {filtered
                        ? "Try widening the status or risk band."
                        : "Add your first shipment to score its hold risk."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={filtered ? resetFilters : () => setAddOpen(true)}
                    >
                      {filtered ? "Reset filters" : "Add shipment"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {rows && rows.map((s, i) => (
              <TableRow
                key={s.id}
                data-testid="shipment-row-open-detail"
                onClick={() => navigate(`/shipment/${s.id}`)}
                style={stagger(i)}
                className="group cg-rise cursor-pointer hover:bg-accent"
              >
                <TableCell>
                  <div className="font-mono text-sm font-medium">{s.ref}</div>
                  <div className="text-xs text-muted-foreground">{s.goods_desc}</div>
                </TableCell>
                <TableCell><RiskBadge band={s.risk_band} score={s.hold_probability} /></TableCell>
                <TableCell><StatusPill status={s.status} /></TableCell>
                <TableCell className="hidden text-sm md:table-cell">{s.importer_name}</TableCell>
                <TableCell className="hidden lg:table-cell"><span className="font-mono text-xs">{s.hs_code}</span></TableCell>
                <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                  <span className="font-mono">{s.pol}</span> → <span className="font-mono">{s.pod}</span>
                </TableCell>
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all duration-fast ease-out group-hover:translate-x-0.5 group-hover:opacity-100" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

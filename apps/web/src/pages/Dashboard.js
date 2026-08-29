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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { blobToBase64 } from "@/lib/wavRecorder";
import { toast } from "sonner";
import { TrendingDown, AlertTriangle, Gauge, Boxes, ChevronRight, Plus, FileUp } from "lucide-react";

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

function FileField({ label, required, file, onChange }) {
  return (
    <div>
      <Label className="text-xs">
        {label} {required ? "*" : "(optional)"}
      </Label>
      <Input
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      {file && <div className="mt-1 truncate text-[11px] text-muted-foreground">{file.name}</div>}
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
          <DialogTitle>Add a real shipment</DialogTitle>
          <DialogDescription>
            This runs through the actual risk engine against the real immune-memory
            graph — not canned demo data.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manual">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual entry</TabsTrigger>
            <TabsTrigger value="upload">
              <FileUp className="mr-1.5 h-3.5 w-3.5" /> Upload documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              Use HS code <code>8471.30</code> or <code>8504.41</code> with country{" "}
              <code>DE</code> to see a real missing-certificate check fire; other combos
              still simulate for real, just with no certificate requirement on record.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Shipment ID (optional, auto-generated if blank)</Label>
                <Input value={form.shipment_id} onChange={set("shipment_id")} placeholder="e.g. MYCARGO-001" />
              </div>
              <div>
                <Label className="text-xs">Importer</Label>
                <Input value={form.importer_name} onChange={set("importer_name")} />
              </div>
              <div>
                <Label className="text-xs">Exporter</Label>
                <Input value={form.exporter} onChange={set("exporter")} />
              </div>
              <div>
                <Label className="text-xs">HS code *</Label>
                <Input value={form.hs_code} onChange={set("hs_code")} placeholder="8471.30" />
              </div>
              <div>
                <Label className="text-xs">Destination country *</Label>
                <Input value={form.country} onChange={set("country")} placeholder="DE" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Goods description</Label>
                <Input value={form.goods_desc} onChange={set("goods_desc")} placeholder="Laptop computers, 14-inch" />
              </div>
              <div>
                <Label className="text-xs">Port of loading</Label>
                <Input value={form.pol} onChange={set("pol")} placeholder="CNSHA" />
              </div>
              <div>
                <Label className="text-xs">Port of discharge</Label>
                <Input value={form.pod} onChange={set("pod")} placeholder="DEHAM" />
              </div>
              <div>
                <Label className="text-xs">Invoice units *</Label>
                <Input type="number" value={form.invoice_units} onChange={set("invoice_units")} />
              </div>
              <div>
                <Label className="text-xs">Packing list units *</Label>
                <Input type="number" value={form.packing_units} onChange={set("packing_units")} />
              </div>
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
            <p className="text-xs text-muted-foreground">
              Upload the commercial invoice, packing list, and bill of lading — Vertex AI
              Gemini reads the unit counts and HS codes straight off them (PDF, PNG, or
              JPEG), then runs the real engine. No certificate file means no certificate
              on record, exactly like a real missing document.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Shipment ID (optional, auto-generated if blank)</Label>
                <Input value={docForm.shipment_id} onChange={setDoc("shipment_id")} placeholder="e.g. MYCARGO-001" />
              </div>
              <div>
                <Label className="text-xs">Importer</Label>
                <Input value={docForm.importer_name} onChange={setDoc("importer_name")} />
              </div>
              <div>
                <Label className="text-xs">Exporter</Label>
                <Input value={docForm.exporter} onChange={setDoc("exporter")} />
              </div>
              <div>
                <Label className="text-xs">Destination country *</Label>
                <Input value={docForm.country} onChange={setDoc("country")} placeholder="DE" />
              </div>
              <div>
                <Label className="text-xs">Goods description</Label>
                <Input value={docForm.goods_desc} onChange={setDoc("goods_desc")} placeholder="Laptop computers, 14-inch" />
              </div>
              <div>
                <Label className="text-xs">Port of loading</Label>
                <Input value={docForm.pol} onChange={setDoc("pol")} placeholder="CNSHA" />
              </div>
              <div>
                <Label className="text-xs">Port of discharge</Label>
                <Input value={docForm.pod} onChange={setDoc("pod")} placeholder="DEHAM" />
              </div>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Control Tower</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            Import containers, priced by the hour they might stall. <MockedBadge />
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add shipment
        </Button>
      </div>

      <AddShipmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(id) => navigate(`/shipment/${id}`)}
      />

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

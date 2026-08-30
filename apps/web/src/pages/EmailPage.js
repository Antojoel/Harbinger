import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Mail, Send, Eye, ShieldCheck, Tag } from "lucide-react";
import { toast } from "sonner";

const SECTION_LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground";

const STATUS_META = {
  sent: { label: "Delivered", cls: "bg-ok-soft text-ok-foreground", dot: "bg-ok" },
  awaiting_keys: { label: "Draft Logged", cls: "bg-warn-soft text-warn-foreground", dot: "bg-warn" },
  failed: { label: "Failed", cls: "bg-danger-soft text-danger-foreground", dot: "bg-danger" },
};
const statusMeta = (s) => STATUS_META[s] || STATUS_META.failed;

function LogStatusPill({ status }) {
  const m = statusMeta(status);
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} /> {m.label}
    </span>
  );
}

function fmtTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function EmailPage() {
  const location = useLocation();
  const prefill = location.state || {};
  const [recipient, setRecipient] = useState(prefill.recipient_email || "");
  const [subject, setSubject] = useState(prefill.subject || "");
  const [body, setBody] = useState(prefill.body || "");
  const [shipmentId, setShipmentId] = useState(prefill.shipment_id || "");
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState([]);
  const [ready, setReady] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  const loadLog = async () => {
    try {
      const logs = await api.emailLog();
      setLog(logs || []);
    } catch (e) {
      toast.error("Failed to load escalation logs");
    }
  };

  useEffect(() => {
    loadLog();
    api.config().then((c) => setReady(Boolean(c?.resend_ready)));
  }, []);

  const send = async () => {
    if (!recipient || !subject) {
      toast.error("Recipient email and subject are required");
      return;
    }
    setSending(true);
    try {
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.6">${body.replace(
        /\n/g,
        "<br/>"
      )}</div>`;
      const res = await api.sendEmail({
        recipient_email: recipient,
        subject,
        html_content: html,
        shipment_id: shipmentId || undefined,
      });

      if (res.awaiting_keys) {
        toast.info("Escalation draft recorded", {
          description: "Draft saved to audit log. Set RESEND_API_KEY for live delivery.",
        });
      } else {
        toast.success(`Escalation delivered to ${recipient}`);
      }

      // Reset form if from user input
      setRecipient("");
      setSubject("");
      setBody("");
      setShipmentId("");
      await loadLog();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to log escalation");
      await loadLog();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="cg-rise">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Escalations &amp; Audit Trail
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft human-approved document requests to exporters, carriers, or ops desks.
          Nothing is ever auto-submitted to customs.
        </p>
      </header>

      {!ready ? (
        <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            <span className="font-medium text-foreground">Audit &amp; draft mode.</span> Human-approved
            escalations are recorded in the log below and never auto-submitted to customs. Add{" "}
            <code className="rounded bg-background px-1 font-mono">RESEND_API_KEY</code> to the backend to
            deliver live email.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-md bg-ok-soft px-3 py-2 text-xs text-ok-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            <span className="font-medium">Resend API active.</span> Escalations are delivered live and
            recorded in the audit log — still human-approved, never auto-submitted to customs.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-display font-medium">
              <Mail className="h-4 w-4 text-primary" /> Compose Escalation Draft
            </div>
            {shipmentId && (
              <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 font-mono text-xs text-accent-foreground">
                <Tag className="h-3 w-3" /> {shipmentId}
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-1">
              <Label className="text-xs">Recipient Email</Label>
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="ops@shanghaiforwarding.cn"
                data-testid="email-recipient-input"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label className="text-xs">Shipment Reference (Optional)</Label>
              <Input
                value={shipmentId}
                onChange={(e) => setShipmentId(e.target.value)}
                placeholder="e.g. MSKU1234567"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Action needed: Missing Certificate of Origin"
              data-testid="email-subject-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Message Body</Label>
            <Textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Draft your human-approved request message here..."
              data-testid="email-body-input"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-muted-foreground">
              Drafts require explicit confirmation before sending.
            </p>
            <Button
              onClick={send}
              disabled={sending}
              className="gap-2"
              data-testid="email-compose-send-button"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {ready ? "Send Email" : "Log Escalation"}
            </Button>
          </div>
        </Card>

        <Card className="flex min-w-0 flex-col p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 font-display font-medium">
              Escalation Log
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {log.length}
              </span>
            </div>
            <span className={SECTION_LABEL}>Audit trail</span>
          </div>

          {log.length === 0 ? (
            <div className="my-auto rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              No escalation drafts logged yet.
            </div>
          ) : (
            <div className="max-h-[460px] min-w-0 space-y-2 overflow-y-auto pr-1">
              {log.map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedLog(l)}
                  style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                  className="cg-rise group block w-full space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="block min-w-0 flex-1 truncate text-xs font-medium text-foreground group-hover:text-primary">
                      {l.subject}
                    </span>
                    <LogStatusPill status={l.status} />
                  </div>

                  <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">{l.recipient_email}</span>
                    {l.shipment_id && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                        {l.shipment_id}
                      </span>
                    )}
                  </div>

                  {l.created_at && (
                    <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {fmtTime(l.created_at)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Log Detail Modal */}
      <Dialog open={Boolean(selectedLog)} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-base">
              <Eye className="h-4 w-4 text-primary" /> Escalation Detail
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3 pt-2 text-xs">
              <div className="flex items-center justify-between rounded-md bg-muted/60 p-2">
                <span className="text-muted-foreground">Status</span>
                <LogStatusPill status={selectedLog.status} />
              </div>
              {selectedLog.created_at && (
                <div className="flex items-center justify-between rounded-md bg-muted/60 p-2">
                  <span className="text-muted-foreground">Logged</span>
                  <span className="font-mono text-foreground">{fmtTime(selectedLog.created_at)}</span>
                </div>
              )}
              <div>
                <span className="mb-0.5 block text-muted-foreground">Recipient</span>
                <span className="font-mono font-medium text-foreground">
                  {selectedLog.recipient_email}
                </span>
              </div>
              {selectedLog.shipment_id && (
                <div>
                  <span className="mb-0.5 block text-muted-foreground">Shipment Reference</span>
                  <span className="font-mono font-medium text-primary">
                    {selectedLog.shipment_id}
                  </span>
                </div>
              )}
              <div>
                <span className="mb-0.5 block text-muted-foreground">Subject</span>
                <span className="font-medium text-foreground">{selectedLog.subject}</span>
              </div>
              <div>
                <span className="mb-0.5 block text-muted-foreground">Body Content</span>
                <div
                  className="rounded-md border bg-muted/30 p-2.5 font-sans leading-relaxed text-foreground"
                  dangerouslySetInnerHTML={{ __html: selectedLog.body || "(No HTML content)" }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

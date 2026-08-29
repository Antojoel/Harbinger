import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  KeyRound,
  Loader2,
  Mail,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

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

  const statusIcon = (s) =>
    s === "sent" ? (
      <CheckCircle2 className="h-4 w-4 text-[hsl(173_70%_33%)]" />
    ) : s === "awaiting_keys" ? (
      <Clock className="h-4 w-4 text-[hsl(38_92%_45%)]" />
    ) : (
      <AlertCircle className="h-4 w-4 text-[hsl(0_72%_51%)]" />
    );

  const statusBadge = (s) =>
    s === "sent" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(173_70%_94%)] px-2 py-0.5 text-[11px] font-medium text-[hsl(173_70%_25%)]">
        Delivered
      </span>
    ) : s === "awaiting_keys" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(38_92%_92%)] px-2 py-0.5 text-[11px] font-medium text-[hsl(38_92%_30%)]">
        Draft Logged
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(0_72%_94%)] px-2 py-0.5 text-[11px] font-medium text-[hsl(0_72%_35%)]">
        Failed
      </span>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Escalations &amp; Audit Trail
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft human-approved document requests to exporters, carriers, or ops desks.
          Nothing is ever auto-submitted to customs.
        </p>
      </div>

      {!ready ? (
        <Alert className="border-[hsl(38_60%_82%)] bg-[hsl(38_90%_96%)]">
          <KeyRound className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <span className="font-medium">Audit &amp; Draft Mode Active.</span> Human-approved
            escalations are recorded in the audit log below. Add
            <code className="mx-1 rounded bg-muted/60 px-1 font-mono">RESEND_API_KEY</code> to
            the backend environment to deliver live emails.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-[hsl(173_50%_80%)] bg-[hsl(173_60%_96%)]">
          <ShieldCheck className="h-4 w-4 text-[hsl(173_70%_33%)]" />
          <AlertDescription className="text-xs">
            <span className="font-medium text-[hsl(173_70%_25%)]">Resend API Active.</span> Emails
            are sent live to recipient inboxes and recorded in the audit log.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-heading font-medium">
              <Mail className="h-4 w-4 text-primary" /> Compose Escalation Draft
            </div>
            {shipmentId && (
              <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-mono text-accent-foreground">
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

        <Card className="flex flex-col p-5">
          <div className="mb-3 flex items-center justify-between font-heading font-medium">
            <span>Escalation Log ({log.length})</span>
            <span className="text-xs text-muted-foreground font-normal">Audit trail</span>
          </div>

          {log.length === 0 ? (
            <div className="my-auto rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              No escalation drafts logged yet.
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto max-h-[460px] pr-1">
              {log.map((l) => (
                <div
                  key={l.id}
                  onClick={() => setSelectedLog(l)}
                  className="group flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-muted/20 p-3 transition-colors hover:border-primary/50 hover:bg-accent/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      {statusIcon(l.status)}
                      <span className="truncate text-xs font-medium group-hover:text-primary">
                        {l.subject}
                      </span>
                    </div>
                    {statusBadge(l.status)}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{l.recipient_email}</span>
                    {l.shipment_id && (
                      <span className="font-mono text-[10px] uppercase font-semibold">
                        {l.shipment_id}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Log Detail Modal */}
      <Dialog open={Boolean(selectedLog)} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-heading">
              <Eye className="h-4 w-4 text-primary" /> Escalation Detail
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3 pt-2 text-xs">
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-2">
                <span className="text-muted-foreground">Status:</span>
                {statusBadge(selectedLog.status)}
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Recipient:</span>
                <span className="font-mono font-medium text-foreground">
                  {selectedLog.recipient_email}
                </span>
              </div>
              {selectedLog.shipment_id && (
                <div>
                  <span className="text-muted-foreground block mb-0.5">Shipment Reference:</span>
                  <span className="font-mono font-medium text-primary">
                    {selectedLog.shipment_id}
                  </span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground block mb-0.5">Subject:</span>
                <span className="font-medium text-foreground">{selectedLog.subject}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Body Content:</span>
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

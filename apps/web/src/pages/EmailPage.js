import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KeyRound, Loader2, Mail, Send, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function EmailPage() {
  const location = useLocation();
  const prefill = location.state || {};
  const [recipient, setRecipient] = useState(prefill.recipient_email || "");
  const [subject, setSubject] = useState(prefill.subject || "");
  const [body, setBody] = useState(prefill.body || "");
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState([]);
  const [ready, setReady] = useState(true);

  const loadLog = () => api.emailLog().then(setLog);
  useEffect(() => { loadLog(); api.config().then((c) => setReady(c.resend_ready)); }, []);

  const send = async () => {
    if (!recipient || !subject) { toast.error("Recipient and subject are required"); return; }
    setSending(true);
    try {
      const html = `<div style=\"font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.6\">${body.replace(/\n/g, "<br/>")}</div>`;
      const res = await api.sendEmail({ recipient_email: recipient, subject, html_content: html, shipment_id: prefill.shipment_id });
      if (res.awaiting_keys) {
        toast.info("Resend key not configured", { description: res.message });
      } else {
        toast.success(`Email sent to ${recipient}`);
      }
      await loadLog();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
      await loadLog();
    } finally {
      setSending(false);
    }
  };

  const statusIcon = (s) =>
    s === "sent" ? <CheckCircle2 className="h-4 w-4 text-[hsl(173_70%_33%)]" /> :
    s === "awaiting_keys" ? <Clock className="h-4 w-4 text-[hsl(38_92%_45%)]" /> :
    <AlertCircle className="h-4 w-4 text-[hsl(0_72%_51%)]" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Escalations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft a human-approved request to an importer or the ops desk. Nothing is sent to customs.
        </p>
      </div>

      {!ready && (
        <Alert className="border-[hsl(38_60%_82%)] bg-[hsl(38_90%_96%)]">
          <KeyRound className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <span className="font-medium">Awaiting Resend key.</span> Compose &amp; log work now; add
            <span className="font-mono"> RESEND_API_KEY</span> to deliver real email (test mode sends only to verified addresses).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2 font-heading font-medium">
            <Mail className="h-4 w-4 text-primary" /> Compose
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Recipient email</Label>
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)}
              placeholder="officer@importer.com" data-testid="email-recipient-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="email-subject-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Message</Label>
            <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} data-testid="email-body-input" />
          </div>
          <Button onClick={send} disabled={sending} className="gap-2" data-testid="email-compose-send-button">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
          </Button>
        </Card>

        <Card className="p-5">
          <div className="mb-3 font-heading font-medium">Sent log</div>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails yet.</p>
          ) : (
            <div className="space-y-2">
              {log.map((l) => (
                <div key={l.id} className="rounded-lg border p-2.5">
                  <div className="flex items-center gap-2">
                    {statusIcon(l.status)}
                    <span className="truncate text-xs font-medium">{l.subject}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{l.recipient_email} · {l.status}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

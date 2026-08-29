import React, { useEffect, useState } from "react";
import { api, fmtINR } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, KeyRound, Loader2, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip as RTooltip } from "recharts";
import { toast } from "sonner";

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function Pricing() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => { api.pricing().then(setData); }, []);

  const checkout = async (tier) => {
    setBusy(tier.id);
    try {
      const order = await api.order(tier.id);
      if (order.awaiting_keys) {
        toast.info("Razorpay keys not configured yet", { description: order.message });
        setBusy("");
        return;
      }
      const ok = await loadRazorpay();
      if (!ok) { toast.error("Could not load Razorpay"); setBusy(""); return; }
      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "ClearanceGuard",
        description: tier.name,
        order_id: order.order_id,
        handler: async (resp) => {
          try {
            await api.verify({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            toast.success("Payment verified \u2014 thank you!");
          } catch (e) {
            toast.error("Payment captured but verification failed");
          }
        },
        theme: { color: "#1877cc" },
      });
      rzp.open();
    } catch (e) {
      toast.error("Checkout failed");
    } finally {
      setBusy("");
    }
  };

  const avg = data?.avg_demurrage_per_day_inr || 5000;
  const chartData = [
    { name: "Our fee", value: 149, fill: "hsl(210 90% 45%)" },
    { name: "Demurrage / day avoided", value: avg, fill: "hsl(173 70% 33%)" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pay only when it helps. A single avoided hold pays for dozens of checks.
        </p>
      </div>

      {data && !data.razorpay_ready && (
        <Alert className="border-[hsl(38_60%_82%)] bg-[hsl(38_90%_96%)]">
          <KeyRound className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <span className="font-medium">Awaiting Razorpay keys.</span> Checkout UI is fully wired — add
            <span className="font-mono"> RAZORPAY_KEY_ID</span> and
            <span className="font-mono"> RAZORPAY_KEY_SECRET</span> to the backend to complete a live test transaction.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data?.tiers?.map((t) => (
          <Card key={t.id} className={`relative p-6 ${t.highlight ? "ring-2 ring-primary" : ""}`}>
            {t.highlight && (
              <span className="absolute -top-2.5 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                Most popular
              </span>
            )}
            <div className="font-heading text-lg font-semibold">{t.name}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-heading text-3xl font-semibold">
                {t.price_inr ? fmtINR(t.price_inr) : "12%"}
              </span>
              <span className="text-sm text-muted-foreground">/ {t.unit}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.blurb}</p>
            <ul className="mt-4 space-y-2">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(173_70%_33%)]" /> {f}
                </li>
              ))}
            </ul>
            <Button className="mt-5 w-full gap-2" variant={t.highlight ? "default" : "secondary"}
              onClick={() => checkout(t)} disabled={busy === t.id} data-testid="razorpay-checkout-button">
              {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t.price_inr ? `Pay ${fmtINR(t.price_inr)}` : "Start success-fee plan"}
            </Button>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="mb-1 flex items-center gap-2 font-heading font-medium">
          <TrendingDown className="h-4 w-4 text-[hsl(173_70%_33%)]" /> Fee vs. demurrage avoided
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{data?.note}</p>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 40, right: 30 }}>
              <XAxis type="number" tickFormatter={(v) => fmtINR(v)} fontSize={11} />
              <YAxis type="category" dataKey="name" width={140} fontSize={11} />
              <RTooltip formatter={(v) => fmtINR(v)} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

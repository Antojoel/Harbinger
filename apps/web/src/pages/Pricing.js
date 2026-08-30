import React, { useEffect, useState } from "react";
import { api, fmtINR } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, KeyRound, Loader2, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip as RTooltip } from "recharts";
import { toast } from "sonner";

const SECTION_LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground";

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

// recharts renders raw <path fill="…"> / <text fill="…"> attributes, which
// don't resolve CSS var(). Read the resolved design-token values off :root
// (from src/index.css) and re-read them whenever the theme class flips.
const readChartColors = () => {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => `hsl(${s.getPropertyValue(name).trim()})`;
  return {
    c1: v("--chart-1"),
    c2: v("--chart-2"),
    grid: v("--border"),
    axis: v("--muted-foreground"),
    card: v("--card"),
    fg: v("--foreground"),
  };
};

function useChartColors() {
  const [colors, setColors] = useState(readChartColors);
  useEffect(() => {
    const sync = () => setColors(readChartColors());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

export default function Pricing() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const colors = useChartColors();

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
            toast.success("Payment verified — thank you!");
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

  const avg = data?.avg_demurrage_per_day_inr || 5500;
  const perCheck = data?.tiers?.find((t) => t.price_inr)?.price_inr || 149;
  const ratio = Math.max(1, Math.round(avg / perCheck));
  const chartData = [
    { name: "Our fee", value: perCheck, key: "fee" },
    { name: "Demurrage / day avoided", value: avg, key: "demurrage" },
  ];

  return (
    <div className="space-y-8">
      <header className="cg-rise">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pay only when it helps. A single avoided hold pays for dozens of checks.
        </p>
      </header>

      {data && !data.razorpay_ready && (
        <Alert className="border-transparent bg-warn-soft text-warn-foreground [&>svg]:text-warn-foreground">
          <KeyRound className="h-4 w-4" />
          <AlertDescription className="text-xs text-warn-foreground">
            <span className="font-medium">Awaiting Razorpay keys.</span> Checkout is fully wired — add
            <span className="font-mono"> RAZORPAY_KEY_ID</span> and
            <span className="font-mono"> RAZORPAY_KEY_SECRET</span> to the backend to run a live test transaction.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 md:items-center md:gap-6">
        {data?.tiers?.map((t) => {
          const highlighted = Boolean(t.highlight);
          return (
            <Card
              key={t.id}
              className={
                highlighted
                  ? "relative z-10 p-6 shadow-md ring-1 ring-primary transition-transform duration-normal ease-expo md:scale-[1.03]"
                  : "relative p-6 border-border bg-card/60"
              }
            >
              {highlighted && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground shadow-sm">
                  Most popular
                </span>
              )}
              <div className={`font-display text-lg font-semibold ${highlighted ? "text-foreground" : "text-muted-foreground"}`}>
                {t.name}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
                  {t.price_inr ? fmtINR(t.price_inr) : "12%"}
                </span>
                <span className="text-sm text-muted-foreground">/ {t.unit}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.blurb}</p>
              <ul className="mt-4 space-y-2">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${highlighted ? "text-ok" : "text-muted-foreground"}`} /> {f}
                  </li>
                ))}
              </ul>
              <Button className="mt-5 w-full gap-2" variant={highlighted ? "default" : "secondary"}
                onClick={() => checkout(t)} disabled={busy === t.id} data-testid="razorpay-checkout-button">
                {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t.price_inr ? `Pay ${fmtINR(t.price_inr)}` : "Start success-fee plan"}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="p-6">
        <div className={SECTION_LABEL}>Unit economics</div>
        <div className="mt-1 flex items-center gap-2 font-display font-medium">
          <TrendingDown className="h-4 w-4 text-ok" /> Fee vs. demurrage avoided
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{data?.note}</p>

        <div className="mt-4 rounded-md bg-muted p-4 text-sm text-foreground">
          <span className="font-mono font-semibold">{fmtINR(perCheck)}</span> per check vs{" "}
          <span className="font-mono font-semibold">{fmtINR(avg)}/day</span> in demurrage — one prevented
          hold pays for <span className="font-mono font-semibold">~{ratio}</span> checks.
        </div>

        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={28}>
              <XAxis
                type="number"
                tickFormatter={(v) => fmtINR(v)}
                axisLine={false}
                tickLine={false}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: colors.axis }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                axisLine={false}
                tickLine={false}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: colors.axis }}
              />
              <RTooltip
                cursor={{ fill: colors.grid, opacity: 0.35 }}
                formatter={(v) => fmtINR(v)}
                contentStyle={{
                  background: colors.card,
                  border: `1px solid ${colors.grid}`,
                  borderRadius: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: colors.fg,
                }}
                labelStyle={{ color: colors.fg }}
                itemStyle={{ color: colors.fg }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                {chartData.map((e) => (
                  <Cell key={e.key} fill={e.key === "fee" ? colors.c1 : colors.c2} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colors.c1 }} /> Our fee
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colors.c2 }} /> Demurrage avoided / day
          </span>
        </div>
      </Card>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { api, fmtINR } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, KeyRound, Loader2, TrendingDown, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip as RTooltip } from "recharts";
import { toast } from "sonner";
import { stagger } from "@/lib/motion";

const SECTION_LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground";
const ANNUAL_DISCOUNT = 0.2;
const SALES_EMAIL = "sales@harbinger.trade";

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

/** Effective per-month price for the chosen billing cycle. The backend ships
 *  `price_inr_annual` pre-computed; the local fallback keeps the card honest
 *  if an older engine build only returns the monthly figure. */
const monthlyPrice = (tier, annual) => {
  if (tier.price_inr === null || tier.price_inr === undefined) return null;
  if (!annual) return tier.price_inr;
  return tier.price_inr_annual ?? Math.round(tier.price_inr * (1 - ANNUAL_DISCOUNT));
};

export default function Pricing() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [annual, setAnnual] = useState(false);
  const colors = useChartColors();

  useEffect(() => {
    api.pricing().then(setData);
  }, []);

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
        name: "Harbinger",
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

  const tiers = data?.tiers || [];
  const avg = data?.avg_demurrage_per_day_inr || 5500;

  // ROI framing uses the cheapest paid plan: the whole month against a single
  // day of demurrage. No invented savings — both numbers come from the API.
  const entry = useMemo(
    () => tiers.filter((t) => t.price_inr).sort((a, b) => a.price_inr - b.price_inr)[0],
    [tiers]
  );
  const entryPrice = monthlyPrice(entry || {}, annual) || 0;
  const days = avg > 0 ? (entryPrice / avg).toFixed(1) : "0";
  const chartData = [
    { name: `${entry?.name || "Entry"} plan / month`, value: entryPrice, key: "fee" },
    { name: "Demurrage / day avoided", value: avg, key: "demurrage" },
  ];

  return (
    <div className="space-y-8" data-testid="pricing-page">
      <header className="cg-rise text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Simple. Transparent. Predictable.</p>

        <div className="mt-5 inline-flex rounded-full border border-border bg-card p-1 shadow-sm">
          {[
            { id: "monthly", label: "Monthly", on: false },
            { id: "annual", label: "Annual", on: true },
          ].map((opt) => {
            const active = annual === opt.on;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAnnual(opt.on)}
                aria-pressed={active}
                data-testid={`billing-toggle-${opt.id}`}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors duration-fast ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
                {opt.on && (
                  <span className={active ? "ml-1.5 opacity-80" : "ml-1.5 text-ok"}>Save 20%</span>
                )}
              </button>
            );
          })}
        </div>
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

      <div className="grid items-center gap-5 lg:grid-cols-3 lg:gap-6">
        {tiers.map((t, i) => {
          const highlighted = Boolean(t.highlight);
          const price = monthlyPrice(t, annual);
          const isCustom = price === null;
          return (
            <Card
              key={t.id}
              style={stagger(i, 60)}
              className={
                highlighted
                  ? "cg-rise relative z-10 flex flex-col p-6 pt-7 shadow-md ring-1 ring-primary transition-transform duration-normal ease-expo lg:scale-[1.045]"
                  : "cg-rise relative flex flex-col border-border bg-card/60 p-6 pt-7"
              }
            >
              {highlighted && (
                <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground shadow-sm">
                  <Sparkles className="h-3 w-3" /> Most popular
                </span>
              )}

              <div
                className={`font-display text-lg font-semibold ${
                  highlighted ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {t.name}
              </div>

              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
                  {isCustom ? "Custom" : fmtINR(price)}
                </span>
                {!isCustom && <span className="text-sm text-muted-foreground">/ {t.unit}</span>}
              </div>

              <div className="mt-1 h-4 text-[11px] text-muted-foreground">
                {isCustom
                  ? "Volume-based, billed annually"
                  : annual
                    ? `billed annually — ${fmtINR(price * 12)}/yr`
                    : `${fmtINR(monthlyPrice(t, true))}/mo billed annually`}
              </div>

              <p className="mt-3 text-xs text-muted-foreground">{t.blurb}</p>

              <ul className="mt-4 flex-1 space-y-2">
                {(t.features || []).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${highlighted ? "text-ok" : "text-muted-foreground"}`}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {isCustom ? (
                <Button asChild className="mt-5 w-full" variant="secondary">
                  <a
                    href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(
                      "Harbinger Enterprise enquiry"
                    )}`}
                    data-testid="contact-sales-button"
                  >
                    Contact sales
                  </a>
                </Button>
              ) : (
                <Button
                  className="mt-5 w-full gap-2"
                  variant={highlighted ? "default" : "secondary"}
                  onClick={() => checkout(t)}
                  disabled={busy === t.id}
                  data-testid="razorpay-checkout-button"
                >
                  {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Get started
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        All plans include access to the Harbinger Engine.
      </p>

      <Card className="p-6">
        <div className={SECTION_LABEL}>Unit economics</div>
        <div className="mt-1 flex items-center gap-2 font-display font-medium">
          <TrendingDown className="h-4 w-4 text-ok" /> Fee vs. demurrage avoided
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{data?.note}</p>

        <div className="mt-4 rounded-md bg-muted p-4 text-sm text-foreground">
          <span className="font-mono font-semibold">{fmtINR(entryPrice)}</span> a month vs{" "}
          <span className="font-mono font-semibold">{fmtINR(avg)}/day</span> in demurrage — the entry
          plan costs about <span className="font-mono font-semibold">{days}</span> days of a single
          held container.
        </div>

        <div className="mt-4 h-48 w-full">
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
                width={170}
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

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** Static, dependency-free depiction of the product loop:
 *  predict hold risk -> prevent the hold -> remember the rejection,
 *  which feeds the next prediction. Pure SVG, no animation. */
function LoopDiagram({ className = "" }) {
  const stages = [
    { key: "Predict", x: 34, color: "hsl(var(--primary))", desc: "score hold risk" },
    { key: "Prevent", x: 170, color: "hsl(var(--ok))", desc: "fix or escalate" },
    { key: "Remember", x: 306, color: "hsl(var(--chart-4))", desc: "learn the rejection" },
  ];
  return (
    <figure className={`mt-10 ${className}`}>
      <svg
        viewBox="0 0 340 118"
        className="w-full max-w-[340px] overflow-visible"
        role="img"
        aria-label="The ClearanceGuard loop: predict a shipment's hold risk, prevent the hold, then remember the rejection so the next prediction is sharper."
      >
        <defs>
          <marker
            id="cg-loop-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
        </defs>

        <line
          x1="48" y1="34" x2="156" y2="34"
          stroke="hsl(var(--muted-foreground))" strokeWidth="1.5"
          markerEnd="url(#cg-loop-arrow)"
        />
        <line
          x1="184" y1="34" x2="292" y2="34"
          stroke="hsl(var(--muted-foreground))" strokeWidth="1.5"
          markerEnd="url(#cg-loop-arrow)"
        />
        <path
          d="M306,47 C322,92 300,104 200,104 C110,104 20,104 34,50"
          fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray="4 4"
          markerEnd="url(#cg-loop-arrow)"
        />

        {stages.map((s) => (
          <g key={s.key}>
            <circle cx={s.x} cy="34" r="11" fill="none" stroke={s.color} strokeOpacity="0.28" strokeWidth="1.5" />
            <circle cx={s.x} cy="34" r="6" fill={s.color} />
            <text
              x={s.x} y="64" textAnchor="middle"
              fill="hsl(var(--foreground))"
              style={{ fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600 }}
            >
              {s.key}
            </text>
            <text
              x={s.x} y="77" textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
              style={{ fontSize: "8.5px" }}
            >
              {s.desc}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export default function Login() {
  const { loginWithGoogle, loginAsGuest, googleConfigured } = useAuth();
  const buttonRef = useRef(null);
  const initialized = useRef(false);
  const [busyGuest, setBusyGuest] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleUnavailable, setGoogleUnavailable] = useState(false);

  useEffect(() => {
    if (!googleConfigured || !GOOGLE_CLIENT_ID) return;
    // Google's renderButton() writes directly into buttonRef's DOM node,
    // outside React's control. Only ever do that once - calling it twice
    // (e.g. React StrictMode's dev double-invoke) corrupts the node React
    // thinks it owns and crashes the whole tree on the next reconcile.
    if (initialized.current) return;
    initialized.current = true;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // ~3s at 150ms - the GSI script commonly gets
    // blocked outright by privacy-focused browsers (Brave Shields, strict
    // tracker blockers), so this must give up instead of polling forever.
    const tryInit = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
        attempts += 1;
        if (attempts >= MAX_ATTEMPTS) {
          setGoogleUnavailable(true);
          return;
        }
        setTimeout(tryInit, 150);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            await loginWithGoogle(response.credential);
          } catch (e) {
            toast.error("Google sign-in failed", { description: e?.response?.data?.detail || "Please try again." });
          }
        },
      });
      if (buttonRef.current) {
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          width: 280,
        });
      }
      setGoogleReady(true);
    };
    tryInit();
    return () => {
      cancelled = true;
    };
  }, [googleConfigured, loginWithGoogle]);

  const handleGuest = async () => {
    setBusyGuest(true);
    try {
      await loginAsGuest();
    } catch (e) {
      toast.error("Could not start a guest session");
    } finally {
      setBusyGuest(false);
    }
  };

  const showGoogleSlot = googleConfigured && GOOGLE_CLIENT_ID && !googleUnavailable;

  return (
    <div className="flex min-h-screen flex-col bg-background md:grid md:grid-cols-2 lg:grid-cols-[1.05fr_0.95fr]">
      {/* Brand / value-prop side — stacks above the card under md */}
      <aside className="relative flex flex-col justify-between gap-10 overflow-hidden border-b border-border bg-muted/40 p-8 md:border-b-0 md:border-r lg:p-14">
        <div aria-hidden="true" className="cg-grid-texture pointer-events-none absolute inset-0 opacity-70" />

        <div className="relative flex items-center gap-3 cg-rise">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">ClearanceGuard</span>
        </div>

        <div className="relative max-w-md cg-rise" style={{ animationDelay: "60ms" }}>
          <h1 className="font-display text-3xl font-semibold leading-[1.1] tracking-tight lg:text-4xl">
            Catch the customs hold before customs does.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            A predictive compliance engine that scores every shipment&rsquo;s hold risk,
            fixes the defects it can, and remembers every rejection so the next one is caught faster.
          </p>
          <LoopDiagram className="hidden md:block" />
        </div>

        <p className="relative text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Harbinger &middot; Operational customs intelligence
        </p>
      </aside>

      {/* Auth side */}
      <main className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <Card className="w-full max-w-sm p-6 shadow-md sm:p-8">
          <div className="mb-6">
            <h2 className="font-display text-lg font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Continue to your control tower.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {/* This wrapper's ref'd child is NEVER given React children of its
                own - Google's renderButton() fully owns that node's DOM once
                it fires. The spinner is a sibling overlay, so React never has
                to reconcile inside a node an external script has rewritten. */}
            <div className="relative flex min-h-[40px] w-full items-center justify-center" style={{ display: showGoogleSlot ? "flex" : "none" }}>
              <div ref={buttonRef} />
              {!googleReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {!showGoogleSlot && googleUnavailable && (
              <p className="text-xs text-muted-foreground">
                Google sign-in didn't load — likely blocked by a browser privacy
                shield or ad blocker. Use guest login below, or allow scripts
                from accounts.google.com and reload.
              </p>
            )}
            {!showGoogleSlot && !googleUnavailable && (
              <p className="text-xs text-muted-foreground">
                Google sign-in isn't configured for this deployment.
              </p>
            )}

            <div className="my-1 flex w-full items-center gap-2 text-[11px] text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="secondary"
              className="w-full gap-2"
              onClick={handleGuest}
              disabled={busyGuest}
              data-testid="continue-as-guest-button"
            >
              {busyGuest ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue as Guest
            </Button>

            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Guest sessions get a full sandbox with sample shipments. Nothing is
              filed with customs — every escalation stays human-approved.
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}

import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { LayoutGrid, Play, Sparkles, Network, Mic } from "lucide-react";

const STEPS = [
  {
    icon: LayoutGrid,
    title: "Welcome to Harbinger",
    body: "Overview is your daily read: how many shipments were checked, how many are at risk, and what the engine has learned so far.",
  },
  {
    icon: Play,
    title: "Check before you file",
    body: "Open any shipment and run Risk Check to get a hold-risk score with specific reasons — before customs ever sees the paperwork.",
  },
  {
    icon: Sparkles,
    title: "Fix, or escalate — never guess",
    body: "Internal defects like unit mismatches get one-click auto-fixes. Missing certificates always route to a human-approved draft, never an auto-submission.",
  },
  {
    icon: Network,
    title: "Watch the memory grow",
    body: "Recording a real outcome teaches the immune-memory graph. Open Graph Explorer to watch it — the same failure gets caught faster next time, for every shipment.",
  },
  {
    icon: Mic,
    title: "Ask the Assistant",
    body: "The Assistant button in the header answers questions about any shipment's risk, grounded in that shipment's live analysis.",
  },
];

export default function OnboardingTour() {
  const { showOnboarding, completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);

  if (!showOnboarding) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const Icon = current.icon;

  const finish = () => {
    setStep(0);
    completeOnboarding();
  };

  return (
    <Dialog open={showOnboarding} onOpenChange={(open) => !open && finish()}>
      <DialogContent className="sm:max-w-md" data-testid="onboarding-tour-dialog">
        {/* segmented progress — one filled bar per completed/active step */}
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-normal ease-out ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* keyed wrapper -> remounts on step change so cg-rise replays */}
        <div key={step} className="cg-rise">
          <DialogHeader className="space-y-3 text-left sm:text-left">
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] tabular-nums text-muted-foreground">
                Step {step + 1} / {STEPS.length}
              </span>
            </div>
            <DialogTitle className="text-left text-base">{current.title}</DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed">
              {current.body}
            </DialogDescription>
          </DialogHeader>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between sm:space-x-0">
          <Button variant="ghost" size="sm" onClick={finish} data-testid="onboarding-skip-button">
            Skip
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              data-testid="onboarding-next-button"
            >
              {isLast ? "Get started" : "Next"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

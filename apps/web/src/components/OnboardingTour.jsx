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
    title: "Welcome to the Control Tower",
    body: "Every shipment you're tracking shows up here with its current hold-risk band. Click any row to open its full dossier.",
  },
  {
    icon: Play,
    title: "Simulate before you file",
    body: "Hit Simulate to get a hold-risk score with specific reasons — before customs ever sees the paperwork.",
  },
  {
    icon: Sparkles,
    title: "Fix, or escalate — never guess",
    body: "Internal defects like unit mismatches get one-click auto-fixes. Missing certificates always route to a human-approved draft, never an auto-submission.",
  },
  {
    icon: Network,
    title: "Watch the memory grow",
    body: "Recording a real outcome teaches the immune-memory graph on the right — the same failure gets caught faster next time, for every shipment.",
  },
  {
    icon: Mic,
    title: "Ask it anything",
    body: "The mic button in the corner answers questions about any shipment's risk out loud. Pricing's in the left nav whenever you're ready.",
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
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center">{current.title}</DialogTitle>
          <DialogDescription className="text-center">{current.body}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-1.5 py-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={finish} data-testid="onboarding-skip-button">
            Skip
          </Button>
          <Button
            size="sm"
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            data-testid="onboarding-next-button"
          >
            {isLast ? "Get started" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

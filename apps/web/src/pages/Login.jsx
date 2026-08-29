import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Login() {
  const { loginWithGoogle, loginAsGuest, googleConfigured } = useAuth();
  const buttonRef = useRef(null);
  const [busyGuest, setBusyGuest] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (!googleConfigured || !GOOGLE_CLIENT_ID) return;

    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">ClearanceGuard</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Predictive customs compliance engine
        </p>

        <div className="flex flex-col items-center gap-3">
          {googleConfigured && GOOGLE_CLIENT_ID ? (
            <div ref={buttonRef} className="flex justify-center">
              {!googleReady && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
          ) : (
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
        </div>
      </Card>
    </div>
  );
}

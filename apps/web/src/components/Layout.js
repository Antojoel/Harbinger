import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ShieldCheck, Network, Sparkles, LogOut } from "lucide-react";
import { SideNav } from "@/components/nav/SideNav";
import { RightDock } from "@/components/dock/RightDock";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

function BrandLockup() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <ShieldCheck className="h-[18px] w-[18px]" />
      </div>
      <div className="leading-none">
        <div className="font-display text-[15px] font-semibold tracking-tight">
          ClearanceGuard
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          Predictive customs compliance engine
        </div>
      </div>
    </div>
  );
}

export const Layout = ({ children }) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTab, setDockTab] = useState("memory");

  useEffect(() => setDockOpen(false), [location.pathname]);

  const openDock = (tab) => {
    setDockTab(tab);
    setDockOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="cg-header-wash sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1560px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BrandLockup />

          <div className="flex items-center gap-1.5">
            {/* dock shortcuts — visible below xl where the rail is hidden */}
            <div className="flex items-center gap-1 xl:hidden">
              <Button
                variant="outline" size="sm" className="gap-1.5"
                onClick={() => openDock("memory")}
              >
                <Network className="h-4 w-4" /> Memory
              </Button>
              <Button
                variant="outline" size="sm" className="gap-1.5"
                onClick={() => openDock("assistant")}
                data-testid="open-assistant-button"
              >
                <Sparkles className="h-4 w-4" /> Assistant
              </Button>
            </div>

            <ThemeToggle />

            {user && (
              <div className="ml-1 hidden items-center gap-2 sm:flex">
                {user.picture ? (
                  <img
                    src={user.picture} alt="" referrerPolicy="no-referrer"
                    className="h-6 w-6 rounded-full ring-1 ring-border"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                    {(user.name || "G").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[120px] truncate text-xs text-muted-foreground">
                  {user.name}
                </span>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                  onClick={logout} data-testid="logout-button" aria-label="Log out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6">
        <div className="lg:grid lg:grid-cols-[196px_1fr] lg:gap-8 xl:grid-cols-[196px_1fr_400px]">
          <aside className="mb-4 lg:mb-0">
            <div className="lg:sticky lg:top-24">
              <SideNav />
            </div>
          </aside>

          <main className="min-w-0">{children}</main>

          <aside className="hidden xl:block">
            <div className="sticky top-24 h-[calc(100vh-8rem)]">
              <RightDock tab={dockTab} onTabChange={setDockTab} />
            </div>
          </aside>
        </div>
      </div>

      {/* below-xl: dock as a right sheet */}
      <Sheet open={dockOpen} onOpenChange={setDockOpen}>
        <SheetTrigger asChild>
          <span className="hidden" />
        </SheetTrigger>
        <SheetContent side="right" className="w-[92vw] p-4 sm:w-[420px]">
          <div className="h-[calc(100vh-2rem)] pt-2">
            <RightDock tab={dockTab} onTabChange={setDockTab} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

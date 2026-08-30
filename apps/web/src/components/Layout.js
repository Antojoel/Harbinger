import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ShieldCheck, Sparkles, LogOut, Menu, ChevronsUpDown } from "lucide-react";
import { SideNav } from "@/components/nav/SideNav";
import ChatPanel from "@/components/chat/ChatPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { EngineStatus } from "@/components/EngineStatus";
import { useAuth } from "@/context/AuthContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <ShieldCheck className="h-[19px] w-[19px]" />
      </div>
      <div className="leading-tight">
        <div className="font-display text-[15px] font-semibold tracking-tight">Harbinger</div>
        <div className="text-[11px] text-muted-foreground">Engine</div>
      </div>
    </div>
  );
}

function UserCard({ user, onLogout }) {
  if (!user) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 shadow-sm">
      {user.picture ? (
        <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground">
          {(user.name || "G").slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-medium">{user.name || "Guest"}</div>
        <div className="truncate text-[11px] text-muted-foreground">Compliance Officer</div>
      </div>
      <Button
        variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground"
        onClick={onLogout} data-testid="logout-button" aria-label="Log out"
      >
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function Rail({ user, onLogout, onNavigate }) {
  return (
    <div className="flex h-full flex-col gap-6 py-5">
      <Brand />
      <div className="flex-1 overflow-y-auto px-3">
        <SideNav onNavigate={onNavigate} />
      </div>
      <div className="px-3">
        <UserCard user={user} onLogout={onLogout} />
      </div>
    </div>
  );
}

export const Layout = ({ children }) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
    setChatOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[248px_1fr]">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-screen border-r border-border bg-card lg:block">
        <Rail user={user} onLogout={logout} />
      </aside>

      {/* mobile rail */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-[264px] bg-card p-0">
          <Rail user={user} onLogout={logout} onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur sm:px-7">
          <Button
            variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="hidden min-w-0 lg:block">
            <EngineStatus />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => setChatOpen(true)}
              data-testid="open-assistant-button"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">Assistant</span>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-7 sm:py-8">
          <div className="mx-auto w-full max-w-[1320px]">{children}</div>
        </main>
      </div>

      {/* assistant drawer */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="flex w-[94vw] flex-col gap-0 p-0 sm:w-[420px]">
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-sm font-semibold tracking-tight">Harbinger Assistant</div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Online
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-3">
            <ChatPanel />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export { ChevronsUpDown };

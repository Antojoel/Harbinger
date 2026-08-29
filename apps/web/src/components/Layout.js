import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutGrid, CreditCard, Mail, Plug, ShieldCheck, Network } from "lucide-react";
import { GraphPanel, GraphLegend } from "@/components/GraphPanel";
import { VoiceWidget } from "@/components/VoiceWidget";
import { useGraph } from "@/context/GraphContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Control Tower", icon: LayoutGrid, end: true },
  { to: "/pricing", label: "Pricing", icon: CreditCard },
  { to: "/email", label: "Escalations", icon: Mail },
  { to: "/integrations", label: "Integrations", icon: Plug },
];

const Nav = () => (
  <nav className="space-y-1">
    {NAV.map((n) => (
      <NavLink
        key={n.to}
        to={n.to}
        end={n.end}
        data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
        className={({ isActive }) =>
          `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`
        }
      >
        <n.icon className="h-4 w-4" />
        {n.label}
      </NavLink>
    ))}
  </nav>
);

const GraphSide = () => {
  const { graph } = useGraph();
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium font-heading">Immune Memory</span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {graph.nodes.length} nodes · {graph.edges.length} edges
        </span>
      </div>
      <div className="mb-2">
        <GraphLegend />
      </div>
      <div className="flex-1 overflow-hidden rounded-xl border bg-card" data-testid="immune-memory-panel">
        <GraphPanel />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        The graph grows on camera when you record a real outcome — the memory that prevents the
        same failure next time.
      </p>
    </div>
  );
};

export const Layout = ({ children }) => {
  const location = useLocation();
  const [mobileGraph, setMobileGraph] = useState(false);
  useEffect(() => setMobileGraph(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* top bar */}
      <header className="cg-header-wash sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-heading text-[15px] font-semibold leading-none tracking-tight">
                ClearanceGuard
              </div>
              <div className="text-[11px] text-muted-foreground">Predictive customs compliance engine</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border bg-muted px-2.5 py-1 text-[11px] text-muted-foreground sm:inline">
              Sirius Freight · Bengaluru
            </span>
            <div className="lg:hidden">
              <Sheet open={mobileGraph} onOpenChange={setMobileGraph}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Network className="h-4 w-4" /> Memory
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[92vw] p-4 sm:w-[440px]">
                  <div className="h-[80vh]">
                    <GraphSide />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        <div className="lg:grid lg:grid-cols-[210px_1fr_400px] lg:gap-6">
          {/* left nav */}
          <aside className="mb-4 lg:mb-0">
            <div className="lg:sticky lg:top-24">
              <Nav />
            </div>
          </aside>

          {/* main */}
          <main className="min-w-0">{children}</main>

          {/* right graph */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 h-[calc(100vh-8rem)]">
              <GraphSide />
            </div>
          </aside>
        </div>
      </div>

      <VoiceWidget />
    </div>
  );
};

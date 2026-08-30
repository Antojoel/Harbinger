import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutGrid, Boxes, ShieldCheck, Layers, Network, CreditCard, Mail, Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { to: "/", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/shipments", label: "Shipments", icon: Boxes },
  { to: "/risk-check", label: "Risk Check", icon: ShieldCheck },
  { to: "/patterns", label: "Patterns", icon: Layers },
  { to: "/graph", label: "Graph Explorer", icon: Network },
  { to: "/pricing", label: "Pricing", icon: CreditCard },
  { to: "/email", label: "Escalations", icon: Mail },
  { to: "/integrations", label: "Integrations", icon: Plug },
];

export function SideNav({ onNavigate }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors duration-fast",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )
          }
        >
          <n.icon className="h-[17px] w-[17px] shrink-0" />
          <span className="truncate">{n.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

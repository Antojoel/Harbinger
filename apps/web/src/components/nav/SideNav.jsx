import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutGrid, CreditCard, Mail, Plug } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Control Tower", icon: LayoutGrid, end: true },
  { to: "/pricing", label: "Pricing", icon: CreditCard },
  { to: "/email", label: "Escalations", icon: Mail },
  { to: "/integrations", label: "Integrations", icon: Plug },
];

export function SideNav() {
  return (
    <nav
      aria-label="Primary"
      className="flex gap-1 overflow-x-auto pb-1 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:pb-0"
    >
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
          className={({ isActive }) =>
            cn(
              "group relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors duration-fast",
              isActive
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity duration-fast",
                  isActive ? "opacity-100" : "opacity-0"
                )}
              />
              <n.icon className="h-4 w-4" />
              {n.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

import React from "react";
import { Network, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GraphDockPanel } from "@/components/dock/GraphDockPanel";
import ChatPanel from "@/components/chat/ChatPanel";

const TABS = [
  { id: "memory", label: "Memory", icon: Network },
  { id: "assistant", label: "Assistant", icon: Sparkles },
];

/**
 * The right-hand dock. A two-tab panel: the live immune-memory graph, and the
 * AI assistant chat. Used both as the sticky desktop rail and inside the mobile
 * Sheet. `tab` / `onTabChange` are controlled so the header button can deep-link
 * to a tab.
 */
export function RightDock({ tab, onTabChange, className }) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="mb-3 inline-flex w-full rounded-md bg-muted p-1">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              data-testid={`dock-tab-${t.id}`}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-8px)] px-3 py-1.5 text-sm font-medium transition-all duration-fast ease-out",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "memory" ? <GraphDockPanel /> : <ChatPanel />}
      </div>
    </div>
  );
}

import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A titled dashboard panel: hairline card, header row with an optional
 *  right-hand action, then body. Shared by every block on the Overview. */
export function Panel({ title, hint, action, className = "", bodyClassName = "", children }) {
  return (
    <Card className={cn("rounded-xl", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn("px-5 pb-5 pt-4", bodyClassName)}>{children}</div>
    </Card>
  );
}

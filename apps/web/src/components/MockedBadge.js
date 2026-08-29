import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

export const MockedBadge = ({ text = "Seeded demo data" }) => (
  <TooltipProvider delayDuration={100}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3" /> {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs">
        This is a demo. Shipment &amp; customs data is seeded/mocked — there is no live government
        integration. Certificates are never auto-submitted.
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

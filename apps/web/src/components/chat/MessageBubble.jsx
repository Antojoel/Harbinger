import React from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * One line in the transcript. Three shapes:
 *  - "user"      → right-aligned brand bubble
 *  - "assistant" → left-aligned muted bubble
 *  - "system"    → subtle inline status line (errors, "pick a shipment")
 *  - "divider"   → thin "· now asking about X ·" context-change rule
 */
export function MessageBubble({ role, text }) {
  if (role === "divider") {
    return (
      <div className="my-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="whitespace-nowrap">· now asking about {text} ·</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  if (role === "system") {
    return (
      <p className="py-0.5 text-center text-[11px] text-muted-foreground">{text}</p>
    );
  }

  const isUser = role === "user";
  const reduced = prefersReducedMotion();

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap px-3 py-2 text-sm",
          !reduced && "cg-rise",
          isUser
            ? "rounded-lg rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-lg rounded-tl-sm bg-muted text-foreground"
        )}
      >
        {text}
      </div>
    </div>
  );
}

export default MessageBubble;

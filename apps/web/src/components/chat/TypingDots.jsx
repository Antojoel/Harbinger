import React from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Three-dot "assistant is thinking" indicator. Uses the shared `.cg-typing-dot`
 * keyframe from index.css; falls back to three static dots when the user has
 * asked for reduced motion.
 */
export function TypingDots() {
  const reduced = prefersReducedMotion();

  return (
    <div
      className="flex w-fit items-center gap-1 rounded-lg rounded-tl-sm bg-muted px-3 py-2.5"
      role="status"
      aria-label="Assistant is thinking"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full bg-muted-foreground/60",
            !reduced && "cg-typing-dot"
          )}
          style={reduced ? undefined : { animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

export default TypingDots;

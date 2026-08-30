import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[cg-shimmer_1.6s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-card/60 before:to-transparent",
        className
      )}
      {...props} />
  );
}

export { Skeleton }

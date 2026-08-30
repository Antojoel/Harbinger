// Small motion helpers shared across the app. Keep effects on transform/opacity.

/** Inline style for a staggered list-item enter. Pair with the `cg-rise` class.
 *  Caps the delay so long lists don't crawl in. */
export function stagger(index, step = 35, max = 12) {
  const i = Math.min(index, max);
  return { animationDelay: `${i * step}ms` };
}

/** True when the user asked for reduced motion. */
export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

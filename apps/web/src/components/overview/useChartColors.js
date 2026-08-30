import { useEffect, useState } from "react";

// recharts renders raw <path fill="…"> / <text fill="…"> SVG attributes, which
// don't resolve CSS var(). Read the resolved design-token values off :root
// (from src/index.css) and re-read them whenever the theme class flips.
// Same pattern as src/pages/Pricing.js.
const readChartColors = () => {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => `hsl(${s.getPropertyValue(name).trim()})`;
  return {
    c1: v("--chart-1"),
    c2: v("--chart-2"),
    c3: v("--chart-3"),
    c4: v("--chart-4"),
    c5: v("--chart-5"),
    grid: v("--border"),
    axis: v("--muted-foreground"),
    card: v("--card"),
    border: v("--border"),
    fg: v("--foreground"),
  };
};

export function useChartColors() {
  const [colors, setColors] = useState(readChartColors);
  useEffect(() => {
    const sync = () => setColors(readChartColors());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

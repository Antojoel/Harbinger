// Visual-check screenshotter. Logs in as guest, walks every route.
// Usage: PLAYWRIGHT_BROWSERS_PATH=0 node scripts/shots.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SHOT_BASE || "http://localhost:5199";
const OUT = process.argv[2] || "/tmp/claude-1000/-home-vicky-Documents-GIT-Harbinger/2635542e-1216-4be4-b607-06b47cbcf547/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ["/", "01-overview"],
  ["/shipments", "02-shipments"],
  ["/risk-check", "03-risk-check"],
  ["/patterns", "05-patterns"],
  ["/graph", "06-graph"],
  ["/pricing", "07-pricing"],
  ["/email", "08-escalations"],
  ["/integrations", "09-integrations"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 160)));

await page.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
const guest = page.getByTestId("continue-as-guest-button");
if (await guest.isVisible().catch(() => false)) {
  await guest.click();
  await page.waitForTimeout(1400);
  const skip = page.getByTestId("onboarding-skip-button");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(500);
}

for (const [path, name] of ROUTES) {
  await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("·", name);
}

// shipment dossier
await page.goto(BASE + "/shipments", { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(900);
const row = page.getByTestId("shipment-row-open-detail").first();
if (await row.isVisible().catch(() => false)) {
  await row.click();
  await page.waitForTimeout(1000);
  const sim = page.getByTestId("simulate-button");
  if (await sim.isVisible().catch(() => false)) { await sim.click(); await page.waitForTimeout(1800); }
  await page.screenshot({ path: `${OUT}/04-dossier.png`, fullPage: true });
  console.log("· 04-dossier");
}

if (errors.length) console.log("\nCONSOLE ERRORS:\n" + [...new Set(errors)].join("\n"));
await browser.close();
console.log("\n->", OUT);

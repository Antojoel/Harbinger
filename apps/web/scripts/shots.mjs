// Visual-loop screenshotter. Logs in as guest, walks the app, saves PNGs.
// Usage: node scripts/shots.mjs [outDir]  (needs vite on :5199 + engine on :8000)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SHOT_BASE || "http://localhost:5199";
const OUT = process.argv[2] || "/tmp/claude-1000/-home-vicky-Documents-GIT-Harbinger/2635542e-1216-4be4-b607-06b47cbcf547/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const shots = [
  { name: "01-login", path: "/", pre: async () => {} },
  {
    name: "02-dashboard",
    path: "/",
    pre: async (page) => {
      // guest login
      const guest = page.getByTestId("continue-as-guest-button");
      if (await guest.isVisible().catch(() => false)) {
        await guest.click();
        await page.waitForTimeout(1200);
      }
      // dismiss onboarding
      const skip = page.getByTestId("onboarding-skip-button");
      if (await skip.isVisible().catch(() => false)) await skip.click();
      await page.waitForTimeout(600);
    },
  },
  { name: "03-pricing", path: "/pricing" },
  { name: "04-email", path: "/email" },
  { name: "05-integrations", path: "/integrations" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && console.log("  [console.error]", m.text().slice(0, 200)));

for (const s of shots) {
  await page.goto(BASE + s.path, { waitUntil: "networkidle" }).catch(() => {});
  if (s.pre) await s.pre(page);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: true });
  console.log("saved", s.name);
}

// shipment detail — click first row
await page.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(700);
const row = page.getByTestId("shipment-row-open-detail").first();
if (await row.isVisible().catch(() => false)) {
  await row.click();
  await page.waitForTimeout(900);
  const sim = page.getByTestId("simulate-button");
  if (await sim.isVisible().catch(() => false)) { await sim.click(); await page.waitForTimeout(1500); }
  await page.screenshot({ path: `${OUT}/06-shipment-detail.png`, fullPage: true });
  console.log("saved 06-shipment-detail");
}

// assistant dock (open via header button at this width it's hidden; use xl viewport)
await ctx.close();
const wide = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 });
const wp = await wide.newPage();
await wp.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
await wp.waitForTimeout(800);
const at = wp.getByTestId("dock-tab-assistant");
if (await at.isVisible().catch(() => false)) {
  await at.click();
  await wp.waitForTimeout(500);
  await wp.getByTestId("assistant-composer").fill("Why is this flagged?");
  await wp.getByTestId("assistant-send").click();
  await wp.waitForTimeout(2500);
}
await wp.screenshot({ path: `${OUT}/07-assistant.png`, fullPage: false });
console.log("saved 07-assistant");

await browser.close();
console.log("done ->", OUT);

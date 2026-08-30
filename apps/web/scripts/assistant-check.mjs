// Verifies the Assistant: default scope, fleet answer without a selection,
// and that read-aloud actually requests Kokoro audio and plays it.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SHOT_BASE || "http://localhost:5199";
const OUT = "/tmp/claude-1000/-home-vicky-Documents-GIT-Harbinger/2635542e-1216-4be4-b607-06b47cbcf547/scratchpad/assistant";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errs = [];
const speakCalls = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
page.on("response", (r) => {
  if (r.url().includes("/api/speak")) speakCalls.push(r.status());
});

await page.goto(BASE + "/", { waitUntil: "networkidle" });
const guest = page.getByTestId("continue-as-guest-button");
if (await guest.isVisible().catch(() => false)) {
  await guest.click();
  await page.waitForTimeout(1400);
  const skip = page.getByTestId("onboarding-skip-button");
  if (await skip.isVisible().catch(() => false)) await skip.click();
}
await page.waitForTimeout(600);

await page.getByTestId("open-assistant-button").click();
await page.waitForTimeout(900);

const scope = (await page.getByTestId("assistant-shipment-select").innerText()).replace(/\s+/g, " ").trim();
console.log("default scope on /:", JSON.stringify(scope));

// turn read-aloud on
await page.getByRole("button", { name: /read answers aloud/i }).click();
await page.waitForTimeout(300);

// track whether an <audio> element actually starts playing
await page.evaluate(() => {
  window.__played = false;
  const orig = window.Audio;
  window.Audio = function (src) {
    const el = new orig(src);
    el.addEventListener("play", () => { window.__played = true; });
    return el;
  };
});

await page.getByTestId("assistant-composer").fill("how many containers are high risk?");
await page.getByTestId("assistant-send").click();
await page.waitForTimeout(30000);

const bubbles = await page.locator('[data-testid="assistant-panel"] .whitespace-pre-wrap').allInnerTexts();
const answer = bubbles[bubbles.length - 1] || "";
console.log("answer:", JSON.stringify(answer.slice(0, 260)));
console.log("/api/speak calls:", speakCalls);
console.log("audio played:", await page.evaluate(() => window.__played));
await page.screenshot({ path: `${OUT}/assistant.png` });

// dossier route should auto-focus
await page.goto(BASE + "/shipments", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.getByTestId("shipment-row-open-detail").first().click();
await page.waitForTimeout(1200);
await page.getByTestId("open-assistant-button").click();
await page.waitForTimeout(900);
const focused = (await page.getByTestId("assistant-shipment-select").innerText()).replace(/\s+/g, " ").trim();
console.log("scope on dossier:", JSON.stringify(focused));

if (errs.length) console.log("\nERRORS:\n" + [...new Set(errs)].join("\n"));
await browser.close();

// Drives the Assistant mic button with a fake audio device so the recording
// path can be verified without a human at the machine.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/claude-1000/-home-vicky-Documents-GIT-Harbinger/2635542e-1216-4be4-b607-06b47cbcf547/scratchpad/mic";
mkdirSync(OUT, { recursive: true });
const BASE = process.env.SHOT_BASE || "http://localhost:5199";
const WAV = "/tmp/claude-1000/-home-vicky-Documents-GIT-Harbinger/2635542e-1216-4be4-b607-06b47cbcf547/scratchpad/q.wav";

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${WAV}%noloop`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1512, height: 950 },
  deviceScaleFactor: 2,
  permissions: ["microphone"],
});
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));

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
await page.waitForTimeout(700);

const mic = page.getByTestId("assistant-mic");
if (!(await mic.isVisible().catch(() => false))) {
  console.log("FAIL: mic button not rendered");
  await browser.close();
  process.exit(1);
}

await mic.click();
// Is it still listening a second later? (the reported bug: closes instantly)
await page.waitForTimeout(1000);
const pressed1s = await mic.getAttribute("aria-pressed");
console.log("aria-pressed @1s:", pressed1s);
await page.screenshot({ path: `${OUT}/1-listening.png` });

await page.waitForTimeout(1500);
const pressed25 = await mic.getAttribute("aria-pressed");
console.log("aria-pressed @2.5s:", pressed25);
await page.screenshot({ path: `${OUT}/2-listening-later.png` });

// Let stop-on-silence fire, then wait for transcription to land.
await page
  .waitForFunction(
    () => {
      const ta = document.querySelector('[data-testid="assistant-composer"]');
      return ta && ta.value && ta.value.trim().length > 0;
    },
    { timeout: 45000 }
  )
  .catch(() => {});

const draft = await page
  .getByTestId("assistant-composer")
  .inputValue()
  .catch(() => "");
console.log("composer after dictation:", JSON.stringify(draft));
await page.screenshot({ path: `${OUT}/3-transcribed.png` });

if (errs.length) console.log("\nERRORS:\n" + [...new Set(errs)].join("\n"));
await browser.close();
console.log("\n->", OUT);

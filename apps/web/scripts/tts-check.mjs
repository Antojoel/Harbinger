// Reproduces read-aloud under REAL browser autoplay policy (no override flag).
import { chromium } from "playwright";

const BASE = process.env.SHOT_BASE || "http://localhost:3000";
const browser = await chromium.launch(); // deliberately no autoplay override
const ctx = await browser.newContext({ viewport: { width: 1512, height: 950 } });
const page = await ctx.newPage();

const speakCalls = [];
page.on("response", (r) => r.url().includes("/api/speak") && speakCalls.push(r.status()));
page.on("console", (m) => {
  const t = m.text();
  if (/play|autoplay|NotAllowed|audio/i.test(t)) console.log("  [console]", t.slice(0, 160));
});

await page.goto(BASE + "/", { waitUntil: "networkidle" });
const guest = page.getByTestId("continue-as-guest-button");
if (await guest.isVisible().catch(() => false)) {
  await guest.click();
  await page.waitForTimeout(1400);
  const skip = page.getByTestId("onboarding-skip-button");
  if (await skip.isVisible().catch(() => false)) await skip.click();
}
await page.waitForTimeout(500);

await page.getByTestId("open-assistant-button").click();
await page.waitForTimeout(800);

// Instrument BOTH paths: HTMLAudioElement.play() and speechSynthesis.speak()
await page.evaluate(() => {
  window.__log = [];
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const p = origPlay.apply(this, arguments);
    if (p && p.then) {
      p.then(
        () => window.__log.push("audio.play RESOLVED"),
        (e) => window.__log.push("audio.play REJECTED: " + e.name + " " + e.message)
      );
    } else {
      window.__log.push("audio.play (no promise)");
    }
    return p;
  };
  const synth = window.speechSynthesis;
  if (synth) {
    const origSpeak = synth.speak.bind(synth);
    synth.speak = (u) => {
      window.__log.push("speechSynthesis.speak called");
      u.addEventListener("start", () => window.__log.push("speechSynthesis START"));
      u.addEventListener("error", (e) => window.__log.push("speechSynthesis ERROR " + e.error));
      return origSpeak(u);
    };
  }
});

// Fresh visitor: do NOT touch the toggle. It must already be on.
const pressed = await page
  .locator('[data-testid="assistant-panel"] button[aria-pressed]')
  .first()
  .getAttribute("aria-pressed");
console.log("read-aloud ON by default?", pressed);

await page.getByTestId("assistant-composer").fill("how many containers are high risk?");
await page.getByTestId("assistant-send").click();
await page.waitForTimeout(35000);

console.log("/api/speak:", speakCalls);
console.log("events:", await page.evaluate(() => window.__log));
await browser.close();

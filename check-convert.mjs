import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto("http://localhost:3000/video-convert", { waitUntil: "networkidle" });
console.log("page title check:", await page.title());

// Simulate reaching the "review" step where engine auto-loads, by directly
// invoking the same dynamic-import + load() sequence the page uses.
const result = await page.evaluate(async () => {
  try {
    const { FFmpeg } = await import("/_next/static/chunks/node_modules_@ffmpeg_ffmpeg_dist_esm_index_js.js").catch(() => ({}));
    return { note: "direct chunk import not reliable, skip" };
  } catch (e) {
    return { error: String(e) };
  }
});
console.log("probe result:", JSON.stringify(result));

await page.waitForTimeout(1000);
console.log("--- console logs ---");
logs.forEach(l => console.log(l));

await browser.close();

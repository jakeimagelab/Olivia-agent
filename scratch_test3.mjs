import { chromium } from "playwright-core";

const base = "http://localhost:3002";
const target = process.argv[2];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const logs = [];
page.on("response", (res) => {
  if (res.status() >= 400) logs.push(`[response ${res.status()}] ${res.url()}`);
});
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto(base + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(1000);
await page.evaluate((src) => {
  const iframe = document.createElement("iframe");
  iframe.id = "test-frame";
  iframe.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:99999;background:#fff";
  iframe.src = src;
  document.body.appendChild(iframe);
}, target);

const frameHandle = await page.waitForSelector("#test-frame");
const frame = await frameHandle.contentFrame();
await frame.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);

console.log(logs.join("\n"));
await browser.close();

import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000/quote", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

// Force overflow-y back to visible on html/body only, keep overflow-x hidden, see if sticky recovers
await page.addStyleTag({ content: `html, body { overflow-y: visible !important; }` });
await page.waitForTimeout(100);

const aside = await page.$("aside");
const before = await aside.boundingBox();
console.log("before scroll (patched):", JSON.stringify(before));
await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(300);
const after = await aside.boundingBox();
console.log("after scroll 600px (patched):", JSON.stringify(after));

await browser.close();

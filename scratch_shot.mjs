import { chromium } from "playwright-core";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
await page.goto(process.argv[2], { waitUntil: "networkidle" });
await page.screenshot({ path: process.argv[3], fullPage: false });
await browser.close();

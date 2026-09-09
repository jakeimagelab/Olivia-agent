import { chromium } from "playwright-core";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(process.argv[2], { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.click("text=AI 컷 정리 / RAW 매칭");
await page.waitForTimeout(1000);
await page.screenshot({ path: process.argv[3], fullPage: false });
await browser.close();

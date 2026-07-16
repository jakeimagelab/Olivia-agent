import { chromium } from "playwright";
const OUT = "/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-photoclinic-homepage/dd28a1c0-414a-4ab5-b77b-29d6971ed92e/scratchpad";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addCookies([{ name: "pc_admin_session", value: "active", domain: "127.0.0.1", path: "/" }]);
const page = await context.newPage();
await page.goto("http://127.0.0.1:3020/color-check", { waitUntil: "networkidle", timeout: 20000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  bodyScrollWidth: document.body.scrollWidth,
  scrollX: window.scrollX,
}));
console.log(JSON.stringify(info));
await page.screenshot({ path: `${OUT}/m-color-check2.png`, fullPage: false });
await page.screenshot({ path: `${OUT}/m-color-check2-full.png`, fullPage: true });
await browser.close();

import { chromium } from "playwright";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addCookies([{ name: "pc_admin_session", value: "active", domain: "127.0.0.1", path: "/" }]);
const page = await context.newPage();
await page.goto("http://127.0.0.1:3020/consultation", { waitUntil: "networkidle", timeout: 20000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-photoclinic-homepage/dd28a1c0-414a-4ab5-b77b-29d6971ed92e/scratchpad/m-consultation2.png", fullPage: false });
await browser.close();

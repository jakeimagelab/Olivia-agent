import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3002";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addCookies([
  { name: "pc_admin_session", value: "active", domain: "127.0.0.1", path: "/" },
]);
const page = await context.newPage();
await page.goto(`${BASE}/admin/dashboard/home`, { waitUntil: "networkidle", timeout: 20000 });
await page.waitForTimeout(1000);

const info = await page.evaluate(() => {
  const sheets = [];
  for (const sheet of document.styleSheets) {
    let count = -1, err = null;
    try { count = sheet.cssRules.length; } catch (e) { err = String(e); }
    sheets.push({ href: sheet.href, ownerNode: sheet.ownerNode?.tagName, ruleCount: count, err });
  }
  return sheets;
});
console.log(JSON.stringify(info, null, 2));

await browser.close();

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

const rules = await page.evaluate(() => {
  const sidebar = document.querySelector(".oa-sidebar");
  const out = [];
  for (const sheet of document.styleSheets) {
    let cssRules;
    try { cssRules = sheet.cssRules; } catch { continue; }
    if (!cssRules) continue;
    const walk = (rules, mediaText) => {
      for (const rule of rules) {
        if (rule.type === CSSRule.MEDIA_RULE) {
          walk(rule.cssRules, rule.media.mediaText);
        } else if (rule.selectorText && rule.selectorText.includes("oa-sidebar") && !rule.selectorText.includes("__") && sidebar.matches(rule.selectorText.split(",")[0].trim())) {
          out.push({ selector: rule.selectorText, media: mediaText || null, cssText: rule.style.cssText });
        }
      }
    };
    walk(cssRules, null);
  }
  return out;
});
console.log(JSON.stringify(rules, null, 2));

await browser.close();

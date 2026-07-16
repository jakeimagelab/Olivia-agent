import { chromium } from "playwright";
const OUT = "/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-photoclinic-homepage/dd28a1c0-414a-4ab5-b77b-29d6971ed92e/scratchpad";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addCookies([{ name: "pc_admin_session", value: "active", domain: "127.0.0.1", path: "/" }]);
const page = await context.newPage();

const targets = [
  { path: "/color-check", file: "m-color-check3.png" },
  { path: "/sns-manager", file: "m-sns-manager.png" },
];
for (const t of targets) {
  await page.goto(`http://127.0.0.1:3020${t.path}`, { waitUntil: "networkidle", timeout: 20000 }).catch(e => console.log(e.message));
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  console.log(t.path, JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/${t.file}`, fullPage: false });
}
await browser.close();

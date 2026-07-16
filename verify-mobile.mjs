import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3020";
const OUT = "/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-photoclinic-homepage/dd28a1c0-414a-4ab5-b77b-29d6971ed92e/scratchpad";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addCookies([
  { name: "pc_admin_session", value: "active", domain: "127.0.0.1", path: "/" },
]);
const page = await context.newPage();

const targets = [
  { path: "/consultation", file: "m-consultation3.png" },
  { path: "/per/orders", file: "m-per-orders.png" },
  { path: "/per/campaigns", file: "m-per-campaigns.png" },
  { path: "/seo-delivery", file: "m-seo-delivery.png" },
  { path: "/trend-dashboard", file: "m-trend-dashboard.png" },
  { path: "/gallery", file: "m-gallery.png" },
  { path: "/color-check", file: "m-color-check.png" },
  { path: "/daily-ideas", file: "m-daily-ideas.png" },
  { path: "/shooting", file: "m-shooting.png" },
  { path: "/portal-admin", file: "m-portal-admin.png" },
];

for (const t of targets) {
  await page.goto(`${BASE}${t.path}`, { waitUntil: "networkidle", timeout: 20000 }).catch(e => console.log(`goto error ${t.path}:`, e.message));
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.screenshot({ path: `${OUT}/${t.file}`, fullPage: true });
  console.log(`--- ${t.path} --- horizontal overflow: ${overflow}`);
}

await browser.close();

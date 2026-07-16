import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3002";
const OUT = "/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-photoclinic-homepage/dd28a1c0-414a-4ab5-b77b-29d6971ed92e/scratchpad";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addCookies([
  { name: "pc_admin_session", value: "active", domain: "127.0.0.1", path: "/" },
]);
const page = await context.newPage();

const targets = [
  { path: "/", file: "m-home.png" },
  { path: "/admin/dashboard/home", file: "m-admin-home.png" },
  { path: "/admin/tools", file: "m-admin-tools.png" },
  { path: "/calendar", file: "m-calendar.png" },
  { path: "/mailing", file: "m-mailing.png" },
  { path: "/memo", file: "m-memo.png" },
  { path: "/clients", file: "m-clients.png" },
  { path: "/consultation", file: "m-consultation.png" },
  { path: "/report", file: "m-report.png" },
  { path: "/per/clients", file: "m-per-clients.png" },
];

for (const t of targets) {
  await page.goto(`${BASE}${t.path}`, { waitUntil: "networkidle", timeout: 20000 }).catch(e => console.log(`goto error ${t.path}:`, e.message));
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.screenshot({ path: `${OUT}/${t.file}`, fullPage: true });
  console.log(`--- ${t.path} --- horizontal overflow: ${overflow}`);
}

await browser.close();

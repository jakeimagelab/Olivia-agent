import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3015";
const OUT = "/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-photoclinic-homepage/dd28a1c0-414a-4ab5-b77b-29d6971ed92e/scratchpad";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: "pc_admin_session", value: "active", domain: "127.0.0.1", path: "/" },
]);
const page = await context.newPage();

const targets = [
  { path: "/admin/tools", file: "tools2.png" },
  { path: "/admin/dashboard/home", file: "dashboard-home2.png" },
];

for (const t of targets) {
  await page.goto(`${BASE}${t.path}`, { waitUntil: "networkidle", timeout: 20000 }).catch(e => console.log(`goto error ${t.path}:`, e.message));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${t.file}`, fullPage: true });
  console.log(`shot: ${t.path}`);
}

// mobile viewport for tools page
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await mobileContext.addCookies([
  { name: "pc_admin_session", value: "active", domain: "127.0.0.1", path: "/" },
]);
const mobilePage = await mobileContext.newPage();
await mobilePage.goto(`${BASE}/admin/tools`, { waitUntil: "networkidle", timeout: 20000 }).catch(e => console.log("mobile goto error:", e.message));
await mobilePage.waitForTimeout(2500);
await mobilePage.screenshot({ path: `${OUT}/tools-mobile.png`, fullPage: true });
console.log("shot: mobile tools");

await browser.close();

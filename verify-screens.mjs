import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3015";
const OUT = "/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-photoclinic-homepage/dd28a1c0-414a-4ab5-b77b-29d6971ed92e/scratchpad";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: "pc_admin_session", value: "active", domain: "127.0.0.1", path: "/" },
]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`[console] ${msg.text()}`); });

const targets = [
  { path: "/admin/tools", file: "tools.png" },
  { path: "/admin/dashboard/home", file: "dashboard-home.png" },
  { path: "/calendar", file: "calendar.png" },
];

for (const t of targets) {
  errors.length = 0;
  await page.goto(`${BASE}${t.path}`, { waitUntil: "networkidle", timeout: 20000 }).catch(e => console.log(`goto error ${t.path}:`, e.message));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${t.file}`, fullPage: false });
  console.log(`--- ${t.path} ---`);
  console.log("errors:", errors.length ? errors.join(" | ") : "none");
}

await browser.close();

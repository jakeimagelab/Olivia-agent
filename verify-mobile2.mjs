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
  const shell = document.querySelector(".oa-shell");
  const sidebar = document.querySelector(".oa-sidebar");
  const cs = (el) => el ? getComputedStyle(el) : null;
  const shellCs = cs(shell);
  const sidebarCs = cs(sidebar);
  return {
    shellClasses: shell?.className,
    shellDisplay: shellCs?.display,
    shellGridCols: shellCs?.gridTemplateColumns,
    sidebarClasses: sidebar?.className,
    sidebarPosition: sidebarCs?.position,
    sidebarTransform: sidebarCs?.transform,
    sidebarVisibility: sidebarCs?.visibility,
    sidebarWidth: sidebarCs?.width,
    windowWidth: window.innerWidth,
    matchMedia900: window.matchMedia("(max-width: 900px)").matches,
  };
});
console.log(JSON.stringify(info, null, 2));

await browser.close();

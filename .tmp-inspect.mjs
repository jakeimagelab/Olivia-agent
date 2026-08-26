import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
await page.goto("http://127.0.0.1:3200/admin/tools", { waitUntil: "networkidle", timeout: 20000 });
await page.waitForSelector(".admin-menu-card");

const info = await page.evaluate(() => {
  const card = document.querySelector(".admin-menu-card");
  const cs = getComputedStyle(card, "::before");
  const rect = card.getBoundingClientRect();
  return {
    cardRect: { w: rect.width, h: rect.height },
    before: {
      position: cs.position, top: cs.top, right: cs.right, bottom: cs.bottom, left: cs.left,
      height: cs.height, width: cs.width, background: cs.background, borderRadius: cs.borderRadius,
      padding: cs.padding, webkitMask: cs.webkitMask || cs.getPropertyValue("-webkit-mask"),
      maskComposite: cs.getPropertyValue("mask-composite") || cs.getPropertyValue("-webkit-mask-composite"),
      opacity: cs.opacity,
    },
  };
});
console.log(JSON.stringify(info, null, 2));

await page.screenshot({ path: "/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-glory-hr/fa1d6821-37e6-48a1-861a-4ec8885aba91/scratchpad/tools-page-full.png", fullPage: false });
await browser.close();

import { chromium } from "playwright-core";
const OUT_DIR = "/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-Olivia-agent-main/25c08e36-8ac6-4976-90c4-45e4fbf12fcc/scratchpad";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on("console", (msg) => { if (msg.type() === "error") console.log("[console error]", msg.text()); });
page.on("pageerror", (err) => console.log("[page error]", err.message));
await page.goto("http://localhost:3000/work-journal", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT_DIR}/phase2-workjournal-loaded.png`, fullPage: false });

const panel = page.locator(".pc-card").filter({ hasText: "오늘 할 일" });
await panel.getByRole("button", { name: "추가" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT_DIR}/phase2-workjournal-adding.png`, fullPage: false });
await browser.close();
console.log("DONE");

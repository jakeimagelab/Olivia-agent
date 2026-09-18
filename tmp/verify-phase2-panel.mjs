import { chromium } from "playwright-core";
const OUT_DIR = "/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-Olivia-agent-main/25c08e36-8ac6-4976-90c4-45e4fbf12fcc/scratchpad";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on("console", (msg) => { if (msg.type() === "error") console.log("[console error]", msg.text()); });
await page.goto("http://localhost:3000/work-journal", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT_DIR}/phase2-workjournal-panel.png`, fullPage: false });

const addBtn = page.getByRole("button", { name: "추가" }).first();
await addBtn.click();
await page.getByPlaceholder("할 일 제목").fill("Playwright UI 검증용 항목");
await page.getByRole("button", { name: /추가 중|추가/ }).last().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT_DIR}/phase2-workjournal-panel-after-add.png`, fullPage: false });
await browser.close();
console.log("DONE");

import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
const logs = [];
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto("http://localhost:3000/select-match", { waitUntil: "networkidle" });
await page.getByText("🔢 파일 순서 검토").click();
await page.waitForTimeout(400);

console.log("idle screen title present:", await page.locator("text=파일 순서 검토").count());
console.log("folder pick button present:", await page.locator("text=폴더 선택").count());
console.log("recursive-scan hint present:", await page.locator("text=하위 폴더까지 전부 검사").count());
console.log("pageerrors:", logs);

await browser.close();

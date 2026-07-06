import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));
page.on("requestfailed", (req) => logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));
page.on("response", (res) => {
  if (res.url().includes("select-galleries")) logs.push(`[response] ${res.url()} -> ${res.status()}`);
});

await page.goto("http://localhost:3000/mailing", { waitUntil: "networkidle" });
await page.waitForTimeout(300);

const btn = page.getByText("📸 사진 셀렉 링크 추가");
await btn.click();
await page.waitForTimeout(800);

const hasDropdownText = await page.locator("text=고객명·촬영명 검색").count();
const hasNoGalleryText = await page.locator("text=셀렉 갤러리가 없습니다").count();
console.log("dropdown search input present:", hasDropdownText);
console.log("'no galleries' text present:", hasNoGalleryText);

console.log("--- console/network logs ---");
logs.forEach(l => console.log(l));

await browser.close();
